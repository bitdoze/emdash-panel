import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { domains, sites, storageProfiles } from '#lib/server/db/schema';
import { enqueueJob } from '#lib/server/jobs/queue';
import { recordAudit } from '#lib/server/audit';
import {
	hostnameInUse,
	isValidSiteName,
	normalizeHostname,
	validateSiteDomain
} from '#lib/server/validate';
import { envOpt } from '#lib/server/env';

export const load: PageServerLoad = async () => {
	const profiles = await db
		.select()
		.from(storageProfiles)
		.where(eq(storageProfiles.kind, 'media'));
	return {
		postgresEnabled: !!envOpt('POSTGRES_ADMIN_URL'),
		mediaProfiles: profiles.map((p) => ({ id: p.id, name: p.name, bucket: p.bucket }))
	};
};

export const actions: Actions = {
	default: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim().toLowerCase();
		const hostname = normalizeHostname(String(form.get('hostname') ?? ''));
		const dbEngine = String(form.get('dbEngine') ?? 'sqlite');
		const storageMode = String(form.get('storageMode') ?? 'local');
		const storageProfileId = String(form.get('storageProfileId') ?? '') || null;
		const image = String(form.get('image') ?? '').trim() || null;

		if (!isValidSiteName(name)) {
			return fail(400, {
				error: 'Site name must be lowercase alphanumeric with hyphens (e.g. "my-site")'
			});
		}
		const domainError = validateSiteDomain(hostname);
		if (domainError) return fail(400, { error: domainError });
		if (await hostnameInUse(hostname)) {
			return fail(409, { error: 'That hostname is already assigned to a site' });
		}
		if (!['sqlite', 'postgres'].includes(dbEngine)) {
			return fail(400, { error: 'Unknown database engine' });
		}
		if (dbEngine === 'postgres' && !envOpt('POSTGRES_ADMIN_URL')) {
			return fail(400, { error: 'Managed PostgreSQL is not enabled on this installation' });
		}
		if (storageMode === 's3') {
			if (!storageProfileId) return fail(400, { error: 'Select an S3 media storage profile' });
			const profile = (
				await db.select().from(storageProfiles).where(eq(storageProfiles.id, storageProfileId))
			)[0];
			if (!profile || profile.kind !== 'media') {
				return fail(400, { error: 'Invalid storage profile' });
			}
		}
		if (image && !/^[a-z0-9][a-z0-9._/:@-]{0,199}$/i.test(image)) {
			return fail(400, { error: 'Invalid image reference' });
		}

		const [site] = await db
			.insert(sites)
			.values({
				name,
				dbEngine: dbEngine as 'sqlite' | 'postgres',
				storageMode: storageMode as 'local' | 's3',
				storageProfileId: storageMode === 's3' ? storageProfileId : null,
				image
			})
			.returning();
		await db.insert(domains).values({ siteId: site.id, hostname, isPrimary: true });
		const job = await enqueueJob(
			'site.create',
			{ siteId: site.id },
			{ siteId: site.id, createdBy: locals.user?.id, dedupeKey: `site.create:${site.id}` }
		);
		await recordAudit({
			actorId: locals.user?.id,
			action: 'site.create',
			targetType: 'site',
			targetId: site.id,
			metadata: { name, hostname, dbEngine, storageMode },
			ip: getClientAddress()
		});
		redirect(303, `/sites/${site.id}?job=${job.id}`);
	}
};
