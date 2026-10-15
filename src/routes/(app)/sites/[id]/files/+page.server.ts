import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { sites } from '#lib/server/db/schema';
import { eq } from 'drizzle-orm';
import {
	FilesError,
	createSiteDir,
	deleteSitePath,
	listFiles,
	readSiteFile,
	uploadSiteFile,
	writeSiteFile
} from '#lib/server/files';
import { recordAudit } from '#lib/server/audit';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	const site = (await db.select().from(sites).where(eq(sites.id, params.id)).limit(1))[0];
	if (!site || site.status === 'deleted') error(404, 'Site not found');
	const relPath = url.searchParams.get('path')?.replace(/^\/+|\/+$/g, '') ?? '';
	const openFile = url.searchParams.get('file') ?? '';

	let entries: Awaited<ReturnType<typeof listFiles>> = [];
	let listError: string | null = null;
	let file: Awaited<ReturnType<typeof readSiteFile>> | null = null;
	let filePath: string | null = null;
	let fileError: string | null = null;
	try {
		if (openFile) {
			filePath = openFile;
			file = await readSiteFile(site.id, openFile);
		} else {
			entries = await listFiles(site.id, relPath);
		}
	} catch (err) {
		const msg = err instanceof FilesError ? err.message : 'Failed to read';
		if (openFile) fileError = msg;
		else listError = msg;
	}
	await recordAudit({
		actorId: locals.user?.id,
		action: 'site.files.browse',
		targetType: 'site',
		targetId: site.id,
		metadata: { path: relPath || '/', file: openFile || undefined }
	});
	const crumbs = relPath ? relPath.split('/') : [];
	return {
		site: { id: site.id, name: site.name, status: site.status },
		path: relPath,
		crumbs,
		entries,
		listError,
		file: file ? { ...file, path: filePath } : null,
		fileError
	};
};

async function run(
	siteId: string,
	locals: App.Locals,
	ip: string,
	action: string,
	path: string,
	fn: () => Promise<void>
) {
	try {
		await fn();
	} catch (err) {
		return fail(400, { error: err instanceof FilesError ? err.message : 'Operation failed' });
	}
	await recordAudit({
		actorId: locals.user?.id,
		action: `site.files.${action}`,
		targetType: 'site',
		targetId: siteId,
		metadata: { path },
		ip
	});
	return { ok: true };
}

export const actions: Actions = {
	saveFile: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const filePath = String(form.get('path') ?? '');
		const content = String(form.get('content') ?? '');
		return run(params.id, locals, getClientAddress(), 'save', filePath, () =>
			writeSiteFile(params.id, filePath, content)
		);
	},
	createDir: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const dir = String(form.get('path') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!name || name.includes('/') || name.startsWith('.')) {
			return fail(400, { error: 'Invalid folder name' });
		}
		return run(params.id, locals, getClientAddress(), 'mkdir', `${dir}/${name}`, () =>
			createSiteDir(params.id, dir ? `${dir}/${name}` : name)
		);
	},
	createFile: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const dir = String(form.get('path') ?? '');
		const name = String(form.get('name') ?? '').trim();
		if (!name || name.includes('/') || name.startsWith('.')) {
			return fail(400, { error: 'Invalid file name' });
		}
		return run(params.id, locals, getClientAddress(), 'create', `${dir}/${name}`, () =>
			writeSiteFile(params.id, dir ? `${dir}/${name}` : name, '')
		);
	},
	upload: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const dir = String(form.get('path') ?? '');
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) return fail(400, { error: 'Choose a file' });
		return run(params.id, locals, getClientAddress(), 'upload', `${dir}/${file.name}`, () =>
			uploadSiteFile(params.id, dir, file)
		);
	},
	delete: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const target = String(form.get('path') ?? '');
		if (!target) return fail(400, { error: 'Nothing to delete' });
		return run(params.id, locals, getClientAddress(), 'delete', target, () =>
			deleteSitePath(params.id, target)
		);
	}
};
