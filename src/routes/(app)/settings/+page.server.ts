import { desc, eq } from 'drizzle-orm';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { auditEvents, secretRecords, storageProfiles } from '#lib/server/db/schema';
import { encryptSecret } from '#lib/server/secrets';
import { recordAudit } from '#lib/server/audit';
import { envOpt } from '#lib/server/env';

export const load: PageServerLoad = async () => {
	const profiles = await db.select().from(storageProfiles);
	const audit = await db.select().from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(50);
	return {
		profiles: profiles.map((p) => ({
			id: p.id,
			name: p.name,
			kind: p.kind,
			endpoint: p.endpoint,
			region: p.region,
			bucket: p.bucket,
			prefix: p.prefix,
			publicUrl: p.publicUrl,
			createdAt: p.createdAt.toISOString()
		})),
		audit: audit.map((a) => ({
			id: a.id,
			action: a.action,
			targetType: a.targetType,
			targetId: a.targetId,
			metadata: a.metadata,
			ip: a.ip,
			createdAt: a.createdAt.toISOString()
		})),
		postgresEnabled: !!envOpt('POSTGRES_ADMIN_URL')
	};
};

export const actions: Actions = {
	addStorageProfile: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const kind = String(form.get('kind') ?? 'media');
		const endpoint = String(form.get('endpoint') ?? '').trim();
		const region = String(form.get('region') ?? 'auto').trim() || 'auto';
		const bucket = String(form.get('bucket') ?? '').trim();
		const prefix = String(form.get('prefix') ?? '').trim();
		const publicUrl = String(form.get('publicUrl') ?? '').trim() || null;
		const accessKeyId = String(form.get('accessKeyId') ?? '').trim();
		const secretAccessKey = String(form.get('secretAccessKey') ?? '').trim();

		if (!name || !endpoint || !bucket || !accessKeyId || !secretAccessKey) {
			return fail(400, { error: 'Name, endpoint, bucket and credentials are required' });
		}
		if (!['media', 'backup'].includes(kind)) return fail(400, { error: 'Invalid kind' });
		try {
			new URL(endpoint);
		} catch {
			return fail(400, { error: 'Endpoint must be a URL' });
		}
		if (publicUrl) {
			try {
				new URL(publicUrl);
			} catch {
				return fail(400, { error: 'Public URL must be a URL' });
			}
		}

		const [secret] = await db
			.insert(secretRecords)
			.values({
				name: `storage-${name}`,
				kind: 's3_credentials',
				ciphertext: encryptSecret(JSON.stringify({ accessKeyId, secretAccessKey }))
			})
			.returning();
		await db.insert(storageProfiles).values({
			name,
			kind: kind as 'media' | 'backup',
			endpoint,
			region,
			bucket,
			prefix,
			publicUrl,
			credentialsSecretId: secret.id
		});
		await recordAudit({
			actorId: locals.user?.id,
			action: 'storage_profile.create',
			targetType: 'storage_profile',
			metadata: { name, kind, endpoint, bucket },
			ip: getClientAddress()
		});
		return { added: name };
	},
	deleteStorageProfile: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const profile = (
			await db.select().from(storageProfiles).where(eq(storageProfiles.id, id)).limit(1)
		)[0];
		if (!profile) return fail(404, { error: 'Profile not found' });
		await db.delete(storageProfiles).where(eq(storageProfiles.id, id));
		await db.delete(secretRecords).where(eq(secretRecords.id, profile.credentialsSecretId));
		await recordAudit({
			actorId: locals.user?.id,
			action: 'storage_profile.delete',
			targetType: 'storage_profile',
			targetId: id,
			metadata: { name: profile.name },
			ip: getClientAddress()
		});
		return { deleted: id };
	}
};
