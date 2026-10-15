import { desc } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { jobs } from '#lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const rows = await db.select().from(jobs).orderBy(desc(jobs.createdAt)).limit(100);
	return {
		jobs: rows.map((j) => ({
			id: j.id,
			type: j.type,
			status: j.status,
			siteId: j.siteId,
			progress: j.progress,
			error: j.error,
			attempts: j.attempts,
			createdAt: j.createdAt.toISOString(),
			finishedAt: j.finishedAt?.toISOString() ?? null
		}))
	};
};
