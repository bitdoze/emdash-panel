import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { jobs, metricsSamples, sites } from '#lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const allSites = await db.select().from(sites).orderBy(desc(sites.createdAt)).limit(50);
	const recentJobs = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(15);
	const metricRows = await db
		.select()
		.from(metricsSamples)
		.orderBy(desc(metricsSamples.ts))
		.limit(1);
	const metrics = metricRows[0]
		? (JSON.parse(metricRows[0].payload) as Record<string, unknown>)
		: null;
	return {
		sites: allSites.map((s) => ({
			id: s.id,
			name: s.name,
			status: s.status,
			dbEngine: s.dbEngine,
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
		metrics
	};
};
