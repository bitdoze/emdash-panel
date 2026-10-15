import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { jobs, sites } from '#lib/server/db/schema';
import { latestMetrics, metricsHistory } from '#lib/server/metrics';

export const load: PageServerLoad = async () => {
	const allSites = await db.select().from(sites).orderBy(desc(sites.createdAt)).limit(50);
	const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(10);
	const [latest, history] = await Promise.all([latestMetrics(), metricsHistory(160)]);

	return {
		sites: allSites.map((s) => ({
			id: s.id,
			name: s.name,
			status: s.status,
			dbEngine: s.dbEngine,
			cpuMillicores: s.cpuMillicores,
			memoryMb: s.memoryMb,
			containerName: s.containerName,
			error: s.error,
			createdAt: s.createdAt.toISOString()
		})),
		jobs: recentJobs.map((j) => ({
			id: j.id,
			type: j.type,
			status: j.status,
			siteId: j.siteId,
			progress: j.progress,
			error: j.error,
			createdAt: j.createdAt.toISOString()
		})),
		metrics: latest?.payload ?? null,
		metricsAt: latest?.ts ?? null,
		history: history.map((h) => ({ ts: h.ts, host: h.payload.host, containers: h.payload.containers }))
	};
};
