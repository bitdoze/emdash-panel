import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { backups, domains, jobs, secretRecords, sites } from '#lib/server/db/schema';
import { decryptSecret } from '#lib/server/secrets';
import { enqueueJob, siteHasActiveJob } from '#lib/server/jobs/queue';
import { recordAudit } from '#lib/server/audit';
import {
	hostnameInUse,
	normalizeHostname,
	validateSiteDomain
} from '#lib/server/validate';

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = (await db.select().from(sites).where(eq(sites.id, params.id)))[0];
	if (!site) error(404, 'Site not found');

	const siteDomains = await db.select().from(domains).where(eq(domains.siteId, site.id));
	const siteJobs = await db
		.select()
		.from(jobs)
		.where(eq(jobs.siteId, site.id))
		.orderBy(desc(jobs.createdAt))
		.limit(20);
	const siteBackups = await db
		.select()
		.from(backups)
		.where(eq(backups.siteId, site.id))
		.orderBy(desc(backups.createdAt))
		.limit(20);

	// The setup-gate password is only exposed while the site awaits owner setup.
	let gateCredentials: { username: string; password: string } | null = null;
	if (site.status === 'awaiting_setup' && site.setupGateSecretId) {
		const secret = (
			await db.select().from(secretRecords).where(eq(secretRecords.id, site.setupGateSecretId))
		)[0];
		if (secret) {
			gateCredentials = {
				username: site.setupGateUsername!,
				password: decryptSecret(secret.ciphertext)
			};
		}
	}
	await recordAudit({
		actorId: locals.user?.id,
		action: 'site.view',
		targetType: 'site',
		targetId: site.id
	});

	return {
		site: {
			id: site.id,
			name: site.name,
			status: site.status,
			dbEngine: site.dbEngine,
			storageMode: site.storageMode,
			image: site.image,
			containerName: site.containerName,
			error: site.error,
			createdAt: site.createdAt.toISOString()
		},
		domains: siteDomains.map((d) => ({
			id: d.id,
			hostname: d.hostname,
			isPrimary: d.isPrimary,
			state: d.state
		})),
		jobs: siteJobs.map((j) => ({
			id: j.id,
			type: j.type,
			status: j.status,
			progress: j.progress,
			error: j.error,
			createdAt: j.createdAt.toISOString()
		})),
		backups: siteBackups.map((b) => ({
			id: b.id,
			status: b.status,
			objectKey: b.objectKey,
			sizeBytes: b.sizeBytes,
			createdAt: b.createdAt.toISOString()
		})),
		gateCredentials,
		hasActiveJob: await siteHasActiveJob(site.id)
	};
};

async function runSiteAction(
	siteId: string,
	type: string,
	payload: Record<string, unknown>,
	locals: App.Locals,
	ip: string
) {
	const site = (await db.select().from(sites).where(eq(sites.id, siteId)))[0];
	if (!site || site.status === 'deleted') return fail(404, { error: 'Site not found' });
	if (await siteHasActiveJob(siteId)) {
		return fail(409, { error: 'Another job is already running for this site' });
	}
	const job = await enqueueJob(type, { siteId, ...payload }, {
		siteId,
		createdBy: locals.user?.id,
		dedupeKey: `${type}:${siteId}:${Date.now()}`
	});
	await recordAudit({ actorId: locals.user?.id, action: type, targetType: 'site', targetId: siteId, ip });
	return { started: job.id };
}

export const actions: Actions = {
	start: async ({ params, locals, getClientAddress }) =>
		runSiteAction(params.id, 'site.start', {}, locals, getClientAddress()),
	stop: async ({ params, locals, getClientAddress }) =>
		runSiteAction(params.id, 'site.stop', {}, locals, getClientAddress()),
	completeSetup: async ({ params, locals, getClientAddress }) =>
		runSiteAction(params.id, 'site.complete_setup', {}, locals, getClientAddress()),
	backup: async ({ params, locals, getClientAddress }) => {
		const [backup] = await db
			.insert(backups)
			.values({ siteId: params.id, status: 'pending', destination: 'local' })
			.returning();
		const res = await runSiteAction(
			params.id,
			'site.backup',
			{ backupId: backup.id },
			locals,
			getClientAddress()
		);
		if ('started' in res && res.started) {
			await db.update(backups).set({ jobId: res.started }).where(eq(backups.id, backup.id));
		}
		return res;
	},
	addDomain: async ({ params, request, locals, getClientAddress }) => {
		const site = (await db.select().from(sites).where(eq(sites.id, params.id)))[0];
		if (!site || site.status === 'deleted') return fail(404, { error: 'Site not found' });
		const form = await request.formData();
		const hostname = normalizeHostname(String(form.get('hostname') ?? ''));
		const err = validateSiteDomain(hostname);
		if (err) return fail(400, { error: err });
		if (await hostnameInUse(hostname)) return fail(409, { error: 'Hostname already in use' });
		await db.insert(domains).values({ siteId: site.id, hostname });
		await recordAudit({
			actorId: locals.user?.id,
			action: 'domain.add',
			targetType: 'site',
			targetId: site.id,
			metadata: { hostname },
			ip: getClientAddress()
		});
		// Route reconciliation applies the new domain on the next pass.
		return { added: hostname };
	},
	delete: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const purgeData = form.get('purgeData') === 'on';
		return runSiteAction(params.id, 'site.delete', { purgeData }, locals, getClientAddress());
	}
};
