// Image builds: the bundled EmDash template (tar stream) and git-sourced site
// builds (Docker remote context — the daemon clones repo.git#ref itself).
// Used as a fallback when the default site image is absent locally (the
// installer normally builds it up front).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { docker } from './docker.js';
import { baseLabels, LABELS } from './config.js';

function templateDir(): string {
	const url = new URL('../templates/emdash-node/', import.meta.url);
	if (!existsSync(url)) throw new Error(`EmDash site template not found at ${url.pathname}`);
	return url.pathname;
}

const IMAGE_LABELS = { 'emdash.panel/managed': 'true', 'emdash.panel/role': 'site-image' };

async function followBuild(stream: NodeJS.ReadableStream, onLog?: (line: string) => void): Promise<void> {
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
		labels: IMAGE_LABELS,
		rm: true
	});
	await followBuild(stream as never, onLog);
}

/**
 * Build a site image from a git repository. The Docker daemon clones
 * `repoUrl` (optionally `#ref` or `#ref:subdir`) and runs its Dockerfile —
 * the repo must be an EmDash site with a Dockerfile that listens on 4321.
 */
export async function buildGitImage(
	tag: string,
	repoUrl: string,
	ref?: string,
	buildArgs: Record<string, string> = {},
	onLog?: (line: string) => void
): Promise<void> {
	const remote = ref ? `${repoUrl}#${ref}` : repoUrl;
	const stream = await docker.buildImage(undefined as never, {
		remote,
		t: tag,
		dockerfile: 'Dockerfile',
		buildargs: buildArgs,
		labels: IMAGE_LABELS,
		rm: true
	});
	await followBuild(stream as never, onLog);
}
