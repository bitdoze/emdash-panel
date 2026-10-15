// Bounded host + container metrics sampler. Host numbers come from /proc and
// statfs; container numbers come from a single docker stats pass per interval.
import { readFile } from 'node:fs/promises';
import { statfsSync } from 'node:fs';
import { lt } from 'drizzle-orm';
import { db } from '../src/lib/server/db/index.js';
import { metricsSamples } from '../src/lib/server/db/schema.js';
import { config, LABELS } from './config.js';
import { docker } from './docker.js';

let lastCpu: { idle: number; total: number } | undefined;

async function readHostCpu(): Promise<number | undefined> {
	const stat = await readFile('/proc/stat', 'utf8');
	const line = stat.split('\n').find((l) => l.startsWith('cpu '));
	if (!line) return undefined;
	const parts = line.trim().split(/\s+/).slice(1).map(Number);
	const idle = parts[3] + parts[4];
	const total = parts.reduce((a, b) => a + b, 0);
	const prev = lastCpu;
	lastCpu = { idle, total };
	if (!prev) return undefined;
	const dIdle = idle - prev.idle;
	const dTotal = total - prev.total;
	return dTotal > 0 ? Math.round(((1 - dIdle / dTotal) * 1000)) / 10 : undefined;
}

async function readHostMem(): Promise<Record<string, number>> {
	const raw = await readFile('/proc/meminfo', 'utf8');
	const kv: Record<string, number> = {};
	for (const line of raw.split('\n')) {
		const m = /^(\w+):\s+(\d+) kB/.exec(line);
		if (m) kv[m[1]] = Number(m[2]) * 1024;
	}
	return {
		memTotal: kv.MemTotal,
		memAvailable: kv.MemAvailable,
		swapTotal: kv.SwapTotal,
		swapFree: kv.SwapFree
	};
}

async function readLoad(): Promise<number[]> {
	const raw = await readFile('/proc/loadavg', 'utf8');
	return raw.trim().split(/\s+/).slice(0, 3).map(Number);
}

async function collectContainerStats(): Promise<Record<string, unknown>[]> {
	const containers = await docker.listContainers({
		filters: { label: [`${LABELS.managed}=true`, `${LABELS.installation}=${config.installationId}`] }
	});
	const out: Record<string, unknown>[] = [];
	for (const c of containers) {
		try {
			const stats = await docker.getContainer(c.Id).stats({ stream: false });
			const cpuDelta =
				stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
			const sysDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
			const online = stats.cpu_stats.online_cpus || 1;
			const cpuPct = sysDelta > 0 ? (cpuDelta / sysDelta) * online * 100 : 0;
			out.push({
				name: c.Names[0]?.replace(/^\//, ''),
				site: c.Labels?.[LABELS.site] ?? null,
				cpuPct: Math.round(cpuPct * 10) / 10,
				memBytes: stats.memory_stats.usage ?? 0,
				memLimit: stats.memory_stats.limit ?? 0,
				restarts: undefined,
				rxBytes: Object.values(stats.networks ?? {}).reduce(
					(a: number, n) => a + ((n as { rx_bytes?: number }).rx_bytes ?? 0),
					0
				),
				txBytes: Object.values(stats.networks ?? {}).reduce(
					(a: number, n) => a + ((n as { tx_bytes?: number }).tx_bytes ?? 0),
					0
				)
			});
		} catch {
			/* container vanished mid-sample */
		}
	}
	return out;
}

export async function sampleMetrics(): Promise<void> {
	const [cpuPct, mem, load] = await Promise.all([readHostCpu(), readHostMem(), readLoad()]);
	let disk: Record<string, number> = {};
	try {
		const s = statfsSync(config.backupDir);
		disk = { diskTotal: s.blocks * s.bsize, diskFree: s.bavail * s.bsize };
	} catch {
		/* backup dir may not exist yet */
	}
	const containers = await collectContainerStats().catch(() => []);
	await db.insert(metricsSamples).values({
		payload: JSON.stringify({
			host: { cpuPct, ...mem, load1: load[0], load5: load[1], load15: load[2], ...disk },
			containers
		})
	});
	// Prune old samples.
	await db
		.delete(metricsSamples)
		.where(lt(metricsSamples.ts, new Date(Date.now() - config.metricsRetentionMs)));
}
