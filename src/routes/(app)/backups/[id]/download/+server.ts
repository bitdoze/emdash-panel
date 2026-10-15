import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { Readable } from 'node:stream';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index';
import { backups, sites } from '#lib/server/db/schema';
import { decryptedStream, encryptedStream } from '#lib/server/backups';
import { recordAudit } from '#lib/server/audit';

// Download a backup archive. ?decrypt=1 streams the plaintext .tar.gz;
// default is the stored AES-256-GCM ciphertext (.tar.gz.enc).
export const GET: RequestHandler = async ({ params, url, locals, getClientAddress }) => {
	if (!locals.user) error(401);
	const backup = (
		await db.select().from(backups).where(eq(backups.id, params.id)).limit(1)
	)[0];
	if (!backup?.objectKey || backup.status !== 'complete') error(404, 'Backup not found');
	const site = (
		await db.select().from(sites).where(eq(sites.id, backup.siteId)).limit(1)
	)[0];
	const base = `${site?.name ?? 'site'}-${backup.createdAt.toISOString().slice(0, 10)}`;
	try {
		if (url.searchParams.get('decrypt') === '1') {
			const stream = await decryptedStream(backup.objectKey);
			await recordAudit({
				actorId: locals.user.id,
				action: 'backup.download',
				targetType: 'backup',
				targetId: backup.id,
				metadata: { site: site?.name, decrypt: true },
				ip: getClientAddress()
			});
			return new Response(Readable.toWeb(stream) as ReadableStream, {
				headers: {
					'content-type': 'application/gzip',
					'content-disposition': `attachment; filename="${base}.tar.gz"`
				}
			});
		}
		const stream = await encryptedStream(backup.objectKey);
		await recordAudit({
			actorId: locals.user.id,
			action: 'backup.download',
			targetType: 'backup',
			targetId: backup.id,
			metadata: { site: site?.name },
			ip: getClientAddress()
		});
		return new Response(Readable.toWeb(stream) as ReadableStream, {
			headers: {
				'content-type': 'application/octet-stream',
				'content-disposition': `attachment; filename="${base}.tar.gz.enc"`,
				'content-length': String(backup.sizeBytes ?? 0)
			}
		});
	} catch {
		error(404, 'Archive file missing on disk');
	}
};
