// Site file manager backend. Site data volumes are bind-mounted into the
// panel at SITE_VOLUME_ROOT (/volumes) — the panel writes as root and chowns
// to uid 1000 (the `node` user site containers run as) so files stay writable
// by the site. All paths are confined to the site's volume root.
import { constants } from 'node:fs';
import {
	access,
	mkdir,
	open,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
	chown
} from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { sites } from './db/schema.js';
import { envOpt } from './env.js';

const SITE_UID = 1000;
const SITE_GID = 1000;
const MAX_READ_BYTES = 512 * 1024;

export class FilesError extends Error {}

async function siteVolumeRoot(siteId: string): Promise<string> {
	const site = (await db.select().from(sites).where(eq(sites.id, siteId)).limit(1))[0];
	if (!site || site.status === 'deleted') throw new FilesError('Site not found');
	if (!site.volumeName) throw new FilesError('Site has no data volume yet');
	const root = path.join(envOpt('SITE_VOLUME_ROOT', '/volumes')!, site.volumeName, '_data');
	try {
		await access(root, constants.R_OK);
	} catch {
		throw new FilesError(`Volume ${site.volumeName} is not mounted`);
	}
	return root;
}

/** Resolve a user-supplied relative path inside the volume; rejects escapes. */
async function resolveInside(siteId: string, relPath: string): Promise<string> {
	const root = await siteVolumeRoot(siteId);
	const clean = path.normalize(`/${relPath}`).replace(/^\/+/, '');
	const abs = path.join(root, clean);
	if (abs !== root && !abs.startsWith(root + path.sep)) {
		throw new FilesError('Path escapes the site volume');
	}
	return abs;
}

export interface FileEntry {
	name: string;
	path: string;
	kind: 'file' | 'dir';
	size: number;
	mtime: number;
}

export async function listFiles(siteId: string, relPath: string): Promise<FileEntry[]> {
	const abs = await resolveInside(siteId, relPath);
	const info = await stat(abs).catch(() => null);
	if (!info) throw new FilesError('Directory not found');
	if (!info.isDirectory()) throw new FilesError('Not a directory');
	const entries = await readdir(abs, { withFileTypes: true });
	const out: FileEntry[] = [];
	for (const e of entries) {
		const p = path.join(relPath, e.name).replaceAll('\\', '/');
		const s = await stat(path.join(abs, e.name)).catch(() => null);
		out.push({
			name: e.name,
			path: p,
			kind: e.isDirectory() ? 'dir' : 'file',
			size: s?.size ?? 0,
			mtime: s?.mtimeMs ?? 0
		});
	}
	return out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1));
}

export async function readSiteFile(
	siteId: string,
	relPath: string
): Promise<{ content: string; binary: boolean; truncated: boolean; size: number }> {
	const abs = await resolveInside(siteId, relPath);
	const info = await stat(abs).catch(() => null);
	if (!info?.isFile()) throw new FilesError('File not found');
	const fh = await open(abs, 'r');
	try {
		const readLen = Math.min(info.size, MAX_READ_BYTES);
		const buf = Buffer.alloc(readLen);
		await fh.read(buf, 0, readLen, 0);
		const binary = buf.includes(0);
		return {
			content: binary ? '' : buf.toString('utf8'),
			binary,
			truncated: info.size > readLen,
			size: info.size
		};
	} finally {
		await fh.close();
	}
}

/** Download the raw file (bounded by caller — intended for site-size files). */
export async function readRawFile(siteId: string, relPath: string): Promise<Buffer> {
	const abs = await resolveInside(siteId, relPath);
	const info = await stat(abs).catch(() => null);
	if (!info?.isFile()) throw new FilesError('File not found');
	if (info.size > 50 * 1024 * 1024) throw new FilesError('File too large to download (>50 MiB)');
	return readFile(abs);
}

async function chownToSite(abs: string, recursive = false): Promise<void> {
	try {
		await chown(abs, SITE_UID, SITE_GID);
		if (recursive) {
			for (const e of await readdir(abs, { withFileTypes: true })) {
				const p = path.join(abs, e.name);
				if (e.isDirectory()) await chownToSite(p, true);
				else await chown(p, SITE_UID, SITE_GID);
			}
		}
	} catch {
		/* read-only mounts or missing perms — leave ownership as-is */
	}
}

export async function writeSiteFile(siteId: string, relPath: string, content: string | Buffer) {
	const abs = await resolveInside(siteId, relPath);
	await writeFile(abs, content);
	await chownToSite(abs);
}

export async function createSiteDir(siteId: string, relPath: string) {
	const abs = await resolveInside(siteId, relPath);
	await mkdir(abs, { recursive: false });
	await chownToSite(abs);
}

export async function deleteSitePath(siteId: string, relPath: string) {
	const abs = await resolveInside(siteId, relPath);
	const root = await siteVolumeRoot(siteId);
	if (abs === root) throw new FilesError('Cannot delete the volume root');
	await rm(abs, { recursive: true, force: false });
}

/** Upload from a browser File — bounded to 64 MiB. */
export async function uploadSiteFile(siteId: string, relDir: string, file: File) {
	if (file.size > 64 * 1024 * 1024) throw new FilesError('Upload exceeds 64 MiB');
	const safeName = path.basename(file.name);
	if (!safeName || safeName !== file.name) throw new FilesError('Invalid file name');
	const abs = await resolveInside(siteId, path.join(relDir, safeName));
	const buf = Buffer.from(await file.arrayBuffer());
	await writeFile(abs, buf);
	await chownToSite(abs);
}
