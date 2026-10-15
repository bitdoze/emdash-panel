// Thin dockerode helpers shared by worker handlers.
import Docker from 'dockerode';
import { config, baseLabels, LABELS } from './config.js';

export const docker = new Docker({ socketPath: config.dockerSocket });

export async function ensureVolume(name: string, siteId?: string): Promise<void> {
	try {
		await docker.getVolume(name).inspect();
	} catch {
		await docker.createVolume({
			Name: name,
			Labels: baseLabels(siteId ? { [LABELS.site]: siteId, [LABELS.role]: 'site-data' } : {})
		});
	}
}

export async function ensureNetwork(name: string, siteId?: string): Promise<void> {
	try {
		await docker.getNetwork(name).inspect();
	} catch {
		await docker.createNetwork({
			Name: name,
			Driver: 'bridge',
			Labels: baseLabels(siteId ? { [LABELS.site]: siteId, [LABELS.role]: 'site-net' } : {})
		});
	}
}

export async function removeNetwork(name: string): Promise<void> {
	try {
		await docker.getNetwork(name).remove();
	} catch {
		/* already gone */
	}
}

export async function removeVolume(name: string): Promise<void> {
	try {
		await docker.getVolume(name).remove();
	} catch {
		/* already gone */
	}
}

export function getContainer(name: string): Docker.Container {
	return docker.getContainer(name);
}

export async function containerExists(name: string): Promise<boolean> {
	try {
		await docker.getContainer(name).inspect();
		return true;
	} catch {
		return false;
	}
}

export async function imageExists(ref: string): Promise<boolean> {
	try {
		await docker.getImage(ref).inspect();
		return true;
	} catch {
		return false;
	}
}

export async function pullImage(ref: string, onProgress?: (line: string) => void): Promise<void> {
	const stream = await docker.pull(ref);
	await new Promise<void>((resolve, reject) => {
		docker.modem.followProgress(
			stream,
			(err: Error | null) => (err ? reject(err) : resolve()),
			(event: { status?: string; id?: string }) => {
				if (onProgress && event.status) onProgress(`${event.id ?? ''} ${event.status}`.trim());
			}
		);
	});
}

/** Connect the Caddy container to a site network (idempotent). */
export async function connectCaddy(networkName: string): Promise<void> {
	const network = docker.getNetwork(networkName);
	const info = await network.inspect();
	const caddy = docker.getContainer(config.caddyContainer);
	const caddyInfo = await caddy.inspect();
	const attached = Object.values(info.Containers ?? {}).some(
		(c) =>
			(c as { Name?: string }).Name === config.caddyContainer ||
			(c as { Name?: string }).Name === caddyInfo.Name.replace(/^\//, '')
	);
	if (!attached) {
		await network.connect({ Container: caddyInfo.Id });
	}
}

/** Disconnect Caddy from a site network (idempotent). */
export async function disconnectCaddy(networkName: string): Promise<void> {
	try {
		const caddyInfo = await docker.getContainer(config.caddyContainer).inspect();
		await docker.getNetwork(networkName).disconnect({ Container: caddyInfo.Id, Force: true });
	} catch {
		/* not connected or network gone */
	}
}

/**
 * Wait until a container's Docker healthcheck reports healthy. Returns true on
 * healthy, false on timeout/exit.
 */
export async function waitHealthy(name: string, timeoutMs: number): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	const container = docker.getContainer(name);
	while (Date.now() < deadline) {
		const info = await container.inspect();
		const status = info.State.Health?.Status;
		if (status === 'healthy') return true;
		if (info.State.Status === 'exited' || info.State.Status === 'dead') return false;
		if (status === 'unhealthy') {
			const failures = info.State.Health?.FailingStreak ?? 0;
			if (failures >= 30) return false;
		}
		await new Promise((r) => setTimeout(r, 2000));
	}
	return false;
}

/** Run a command inside a container and capture stdout/stderr. */
export async function execInContainer(
	name: string,
	cmd: string[],
	timeoutMs = 60_000
): Promise<{ code: number; output: string }> {
	const container = docker.getContainer(name);
	const exec = await container.exec({
		Cmd: cmd,
		AttachStdout: true,
		AttachStderr: true
	});
	const stream = await exec.start({ Detach: false });
	const chunks: Buffer[] = [];
	await new Promise<void>((resolve, reject) => {
		const timer = setTimeout(() => {
			stream.destroy();
			reject(new Error('exec timed out'));
		}, timeoutMs);
		stream.on('data', (c: Buffer) => chunks.push(c));
		stream.on('end', () => {
			clearTimeout(timer);
			resolve();
		});
		stream.on('error', (err: Error) => {
			clearTimeout(timer);
			reject(err);
		});
	});
	const inspected = await exec.inspect();
	// Strip docker's 8-byte multiplexed stream headers when TTY is off.
	const raw = Buffer.concat(chunks);
	const clean: Buffer[] = [];
	let offset = 0;
	while (offset + 8 <= raw.length) {
		const len = raw.readUInt32BE(offset + 4);
		clean.push(raw.subarray(offset + 8, offset + 8 + len));
		offset += 8 + len;
	}
	const output = (clean.length ? Buffer.concat(clean) : raw).toString('utf8');
	return { code: inspected.ExitCode ?? -1, output };
}

export async function listManagedContainers(): Promise<Docker.ContainerInfo[]> {
	return docker.listContainers({
		all: true,
		filters: {
			label: [`${LABELS.managed}=true`, `${LABELS.installation}=${config.installationId}`]
		}
	});
}
