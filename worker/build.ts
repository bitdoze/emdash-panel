// Build the EmDash site image from the bundled template directory.
// Used as a fallback when the default site image is absent locally (the
// installer normally builds it up front).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { docker } from './docker.js';

function templateDir(): string {
	const url = new URL('../templates/emdash-node/', import.meta.url);
	if (!existsSync(url)) throw new Error(`EmDash site template not found at ${url.pathname}`);
	return url.pathname;
}

export async function buildSiteImage(
	tag: string,
	buildArgs: Record<string, string> = {},
	onLog?: (line: string) => void
): Promise<void> {
	const dir = templateDir();
	const tar = spawn('tar', ['-cf', '-', '-C', dir, '.']);
	const stream = await docker.buildImage(tar.stdout as never, {
		t: tag,
		dockerfile: 'Dockerfile',
		buildargs: buildArgs,
		labels: { 'emdash.panel/managed': 'true', 'emdash.panel/role': 'site-image' },
		rm: true
	});
	await new Promise<void>((resolve, reject) => {
		let buf = '';
		stream.on('data', (chunk: Buffer) => {
			buf += chunk.toString('utf8');
			let idx;
			while ((idx = buf.indexOf('\n')) >= 0) {
				const line = buf.slice(0, idx).trim();
				buf = buf.slice(idx + 1);
				if (!line) continue;
				try {
					const evt = JSON.parse(line) as {
						stream?: string;
						error?: string;
						errorDetail?: { message?: string };
					};
					if (evt.error) {
						reject(new Error(evt.errorDetail?.message ?? evt.error));
						return;
					}
					if (evt.stream?.trim()) onLog?.(`build: ${evt.stream.trim().slice(0, 160)}`);
				} catch {
					onLog?.(line.slice(0, 160));
				}
			}
		});
		stream.on('end', resolve);
		stream.on('error', reject);
	});
}
