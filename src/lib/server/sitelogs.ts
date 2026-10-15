// Per-site access-log reader. Caddy writes JSON lines to
// /logs/<siteId>.jsonl on the shared caddy-logs volume; the panel mounts it
// read-only at SITE_LOG_DIR (default /site-logs). Reads are bounded — only the
// tail of the file is parsed for the traffic card.
import { open, stat } from 'node:fs/promises';
import { envOpt } from './env.js';

export interface AccessEntry {
	ts: number;
	method: string;
	host: string;
	uri: string;
	status: number;
	size: number;
	durationMs: number;
	clientIp: string;
}

export interface SiteTraffic {
	entries1h: number;
	entries24h: number;
	bytes24h: number;
	errors24h: number;
	topPaths: { path: string; count: number }[];
	recent: AccessEntry[];
	truncated: boolean;
}

const TAIL_BYTES = 512 * 1024;
const MAX_RECENT = 25;

interface CaddyAccessRecord {
	ts?: number;
	request?: {
		method?: string;
		host?: string;
		uri?: string;
		client_ip?: string;
	};
	status?: number;
	size?: number;
	duration?: number;
}

function parseLine(line: string): AccessEntry | null {
	try {
		const r = JSON.parse(line) as CaddyAccessRecord;
		if (!r.request?.uri) return null;
		return {
			ts: (r.ts ?? 0) * 1000,
			method: r.request.method ?? '-',
			host: r.request.host ?? '-',
			uri: r.request.uri,
			status: r.status ?? 0,
			size: r.size ?? 0,
			durationMs: Math.round((r.duration ?? 0) * 1000),
			clientIp: r.request.client_ip ?? '-'
		};
	} catch {
		return null;
	}
}

/** Read the tail of a site's access log and summarize it. null when absent. */
export async function readSiteTraffic(siteId: string): Promise<SiteTraffic | null> {
	const dir = envOpt('SITE_LOG_DIR', '/site-logs')!;
	const file = `${dir}/${siteId}.jsonl`;
	let size: number;
	try {
		size = (await stat(file)).size;
	} catch {
		return null;
	}
	if (size === 0) {
		return { entries1h: 0, entries24h: 0, bytes24h: 0, errors24h: 0, topPaths: [], recent: [], truncated: false };
	}
	const fh = await open(file, 'r');
	try {
		const start = Math.max(0, size - TAIL_BYTES);
		const buf = Buffer.alloc(size - start);
		await fh.read(buf, 0, buf.length, start);
		let text = buf.toString('utf8');
		// Drop a partial first line when we didn't start at an offset of 0.
		if (start > 0) {
			const nl = text.indexOf('\n');
			text = nl >= 0 ? text.slice(nl + 1) : '';
		}
		const now = Date.now();
		const hour = now - 3_600_000;
		const day = now - 86_400_000;
		let entries1h = 0;
		let entries24h = 0;
		let bytes24h = 0;
		let errors24h = 0;
		const pathCounts = new Map<string, number>();
		const recent: AccessEntry[] = [];
		for (const line of text.split('\n')) {
			if (!line.trim()) continue;
			const e = parseLine(line);
			if (!e) continue;
			if (e.ts >= hour) entries1h++;
			if (e.ts >= day) {
				entries24h++;
				bytes24h += e.size;
				if (e.status >= 500) errors24h++;
				const path = e.uri.split('?')[0];
				pathCounts.set(path, (pathCounts.get(path) ?? 0) + 1);
			}
			recent.push(e);
		}
		return {
			entries1h,
			entries24h,
			bytes24h,
			errors24h,
			topPaths: [...pathCounts.entries()]
				.sort((a, b) => b[1] - a[1])
				.slice(0, 5)
				.map(([path, count]) => ({ path, count })),
			recent: recent.slice(-MAX_RECENT).reverse(),
			truncated: start > 0
		};
	} finally {
		await fh.close();
	}
}
