import { error, fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { backups, deployments, domains, jobs, secretRecords, sites } from '#lib/server/db/schema';
import { decryptSecret } from '#lib/server/secrets';
import { enqueueJob, siteHasActiveJob } from '#lib/server/jobs/queue';
import { recordAudit } from '#lib/server/audit';
import { metricsHistory } from '#lib/server/metrics';
import { readSiteTraffic } from '#lib/server/sitelogs';
import {
	LIMITS,
	hostnameInUse,
	isValidGitRef,
	isValidGitUrl,
	normalizeHostname,
	parseCpuMillicores,
	parseMemoryMb,
	validateSiteDomain
} from '#lib/server/validate';

export const load: PageServerLoad = async ({ params, locals }) => {
	const site = (await db.select().from(sites).where(eq(sites.id, params.id)))[0];
	if (!site) error(404, 'Site not found');

	const [siteDomains, siteJobs, siteBackups, siteDeployments, history] = await Promise.all([
		db.select().from(domains).where(eq(domains.siteId, site.id)),
		db.select().from(jobs).where(eq(jobs.siteId, site.id)).orderBy(desc(jobs.createdAt)).limit(15),
		db.select().from(backups).where(eq(backups.siteId, site.id)).orderBy(desc(backups.createdAt)).limit(10),
		db
			.select()
			.from(deployments)
			.where(eq(deployments.siteId, site.id))
			.orderBy(desc(deployments.createdAt))
			.limit(10),
		metricsHistory(160)
	]);

	const traffic = await readSiteTraffic(site.id).catch(() => null);

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

	const usageHistory = history.map((h) => {
		const c = h.payload.containers?.find((x) => x.name === site.containerName);
		return { ts: h.ts, cpuPct: c?.cpuPct ?? null, memBytes: c?.memBytes ?? null };
	});
	const latestUsage = usageHistory[usageHistory.length - 1] ?? null;

	return {
		site: {
			id: site.id,
			name: site.name,
			status: site.status,
			dbEngine: site.dbEngine,
			storageMode: site.storageMode,
			image: site.image,
			containerName: site.containerName,
			sourceRepo: site.sourceRepo,
			sourceRef: site.sourceRef,
			cpuMillicores: site.cpuMillicores ?? LIMITS.cpuMillicores.default,
			memoryMb: site.memoryMb ?? LIMITS.memoryMb.default,
			error: site.error,
			createdAt: site.createdAt.toISOString()
		},
		limits: LIMITS,
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
		deployments: siteDeployments.map((d) => ({
			id: d.id,
			state: d.state,
			image: d.image,
			gitUrl: d.gitUrl,
			gitRef: d.gitRef,
			isCurrent: d.isCurrent,
			error: d.error,
			createdAt: d.createdAt.toISOString()
		})),
		backups: siteBackups.map((b) => ({
			id: b.id,
			status: b.status,
			objectKey: b.objectKey,
			sizeBytes: b.sizeBytes,
			createdAt: b.createdAt.toISOString()
		})),
		usage: latestUsage,
		usageHistory,
		traffic,
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
	updateLimits: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const cpu = parseCpuMillicores(String(form.get('cpuMillicores') ?? ''));
		const mem = parseMemoryMb(String(form.get('memoryMb') ?? ''));
		if (cpu === null || mem === null) {
			return fail(400, {
				error: `Limits out of range (CPU ${LIMITS.cpuMillicores.min}–${LIMITS.cpuMillicores.max} millicores, memory ${LIMITS.memoryMb.min}–${LIMITS.memoryMb.max} MiB)`
			});
		}
		return runSiteAction(
			params.id,
			'site.update_limits',
			{ cpuMillicores: cpu, memoryMb: mem },
			locals,
			getClientAddress()
		);
	},
	deploy: async ({ params, request, locals, getClientAddress }) => {
		const form = await request.formData();
		const repo = String(form.get('gitUrl') ?? '').trim();
		const ref = String(form.get('gitRef') ?? '').trim();
		if (repo && !isValidGitUrl(repo)) return fail(400, { error: 'Invalid repository URL' });
		if (ref && !isValidGitRef(ref)) return fail(400, { error: 'Invalid ref (branch, tag, or SHA)' });
		const [deployment] = await db
			.insert(deployments)
			.values({ siteId: params.id, state: 'queued', gitUrl: repo || null, gitRef: ref || null })
			.returning();
		const res = await runSiteAction(
			params.id,
			'site.deploy',
			{ deploymentId: deployment.id },
			locals,
			getClientAddress()
		);
		if ('started' in res && res.started) {
			await db
				.update(deployments)
				.set({ jobId: res.started })
				.where(eq(deployments.id, deployment.id));
		} else {
			await db
				.update(deployments)
				.set({ state: 'failed', error: 'Deployment job could not be queued', finishedAt: new Date() })
				.where(eq(deployments.id, deployment.id));
		}
		return res;
	},
	redeploy: async ({ params, locals, getClientAddress }) => {
		const site = (await db.select().from(sites).where(eq(sites.id, params.id)))[0];
		if (!site || site.status === 'deleted') return fail(404, { error: 'Site not found' });
		const [deployment] = await db
			.insert(deployments)
			.values({
				siteId: site.id,
				state: 'queued',
				gitUrl: site.sourceRepo,
				gitRef: site.sourceRef
			})
			.returning();
		const res = await runSiteAction(
			params.id,
			'site.deploy',
			{ deploymentId: deployment.id },
			locals,
			getClientAddress()
		);
		if ('started' in res && res.started) {
			await db
				.update(deployments)
				.set({ jobId: res.started })
				.where(eq(deployments.id, deployment.id));
		} else {
			await db
				.update(deployments)
				.set({ state: 'failed', error: 'Deployment job could not be queued', finishedAt: new Date() })
				.where(eq(deployments.id, deployment.id));
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
