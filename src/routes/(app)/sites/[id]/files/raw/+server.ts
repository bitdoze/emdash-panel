import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readRawFile } from '#lib/server/files';
import path from 'node:path';

// Raw file download for the file manager.
export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) error(401);
	const rel = url.searchParams.get('path') ?? '';
	if (!rel) error(400, 'path required');
	try {
		const buf = await readRawFile(params.id, rel);
		return new Response(new Uint8Array(buf), {
			headers: {
				'content-type': 'application/octet-stream',
				'content-disposition': `attachment; filename="${path.basename(rel)}"`,
				'content-length': String(buf.length)
			}
		});
	} catch {
		error(404, 'File not found');
	}
};
