import { error } from '@sveltejs/kit';
import { asc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { jobEvents, jobs } from '#lib/server/db/schema';

export const load: PageServerLoad = async ({ params }) => {
	const job = (await db.select().from(jobs).where(eq(jobs.id, params.id)))[0];
	if (!job) error(404, 'Job not found');
	const events = await db
		.select()
		.from(jobEvents)
		.where(eq(jobEvents.jobId, job.id))
		.orderBy(asc(jobEvents.id));
	return {
		job: {
			id: job.id,
			type: job.type,
			status: job.status,
			siteId: job.siteId,
			error: job.error,
			attempts: job.attempts,
			createdAt: job.createdAt.toISOString(),
			finishedAt: job.finishedAt?.toISOString() ?? null
		},
		events: events.map((e) => ({
			id: e.id,
			ts: e.ts.toISOString(),
			level: e.level,
			message: e.message
		}))
	};
};
