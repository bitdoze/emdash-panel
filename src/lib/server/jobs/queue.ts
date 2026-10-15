// Durable job queue backed by the panel SQLite database.
//
// The web process only enqueues jobs; the operations worker claims them with an
// expiring lease, renews the lease while running, and records bounded log lines
// in job_events. This module is shared by both processes — keep it free of
// $app/* imports.
import { and, asc, eq, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { jobEvents, jobs } from '../db/schema.js';

export type JobRecord = typeof jobs.$inferSelect;

export interface EnqueueOptions {
	siteId?: string;
	dedupeKey?: string;
	createdBy?: string;
	runAfter?: Date;
	maxAttempts?: number;
}

export async function enqueueJob(
	type: string,
	payload: Record<string, unknown> = {},
	opts: EnqueueOptions = {}
): Promise<JobRecord> {
	const inserted = await db
		.insert(jobs)
		.values({
			type,
			payload: JSON.stringify(payload),
			siteId: opts.siteId,
			dedupeKey: opts.dedupeKey,
			createdBy: opts.createdBy,
			runAfter: opts.runAfter ?? new Date(),
			maxAttempts: opts.maxAttempts ?? 5
		})
		.onConflictDoNothing({ target: jobs.dedupeKey })
		.returning();
	if (inserted.length === 0 && opts.dedupeKey) {
		const existing = await db
			.select()
			.from(jobs)
			.where(eq(jobs.dedupeKey, opts.dedupeKey))
			.limit(1);
		if (existing[0]) return existing[0];
	}
	return inserted[0];
}

/** Append a bounded log line to a job's event stream. Secrets must never be logged. */
export async function logJob(
	jobId: string,
	message: string,
	level: 'info' | 'warn' | 'error' = 'info'
): Promise<void> {
	await db.insert(jobEvents).values({ jobId, level, message: message.slice(0, 4000) });
}

export async function setJobProgress(jobId: string, progress: string): Promise<void> {
	await db
		.update(jobs)
		.set({ progress, updatedAt: new Date() })
		.where(eq(jobs.id, jobId));
}

/**
 * Claim the next runnable job for `owner`. A job is runnable when queued and
 * due, or when its previous lease expired mid-run (recovery). Returns undefined
 * when no work is available.
 */
export async function claimJob(owner: string, leaseMs: number): Promise<JobRecord | undefined> {
	const now = new Date();
	const leaseUntil = new Date(now.getTime() + leaseMs);

	// Reset running jobs whose lease expired back to queued so they can be retried.
	await db
		.update(jobs)
		.set({ status: 'queued', updatedAt: now })
		.where(
			and(
				eq(jobs.status, 'running'),
				lt(jobs.leaseExpiresAt, now),
				lt(jobs.attempts, jobs.maxAttempts)
			)
		);
	// Jobs that exhausted attempts while running become failed.
	await db
		.update(jobs)
		.set({
			status: 'failed',
			error: 'Job lease expired after maximum attempts',
			finishedAt: now,
			updatedAt: now
		})
		.where(
			and(
				eq(jobs.status, 'running'),
				lt(jobs.leaseExpiresAt, now),
				sql`${jobs.attempts} >= ${jobs.maxAttempts}`
			)
		);

	const next = await db
		.select()
		.from(jobs)
		.where(and(eq(jobs.status, 'queued'), lte(jobs.runAfter, now)))
		.orderBy(asc(jobs.createdAt))
		.limit(1);
	const job = next[0];
	if (!job) return undefined;

	// Atomic claim: only succeeds if the row is still queued.
	const claimed = await db
		.update(jobs)
		.set({
			status: 'running',
			leaseOwner: owner,
			leaseExpiresAt: leaseUntil,
			attempts: sql`${jobs.attempts} + 1`,
			updatedAt: now
		})
		.where(and(eq(jobs.id, job.id), eq(jobs.status, 'queued')))
		.returning();
	return claimed[0];
}

/** Renew a running job's lease; returns false if the lease was lost. */
export async function renewLease(jobId: string, owner: string, leaseMs: number): Promise<boolean> {
	const updated = await db
		.update(jobs)
		.set({ leaseExpiresAt: new Date(Date.now() + leaseMs) })
		.where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, owner), eq(jobs.status, 'running')))
		.returning({ id: jobs.id });
	return updated.length > 0;
}

export async function finishJob(
	jobId: string,
	owner: string,
	result: { status: 'succeeded' | 'failed' | 'cancelled'; error?: string }
): Promise<void> {
	await db
		.update(jobs)
		.set({
			status: result.status,
			error: result.error?.slice(0, 4000),
			progress: null,
			leaseOwner: null,
			leaseExpiresAt: null,
			finishedAt: new Date(),
			updatedAt: new Date()
		})
		.where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, owner)));
}

/** Requeue a running job after a retryable failure, with backoff. */
export async function retryJob(
	jobId: string,
	owner: string,
	error: string,
	backoffMs: number
): Promise<void> {
	await db
		.update(jobs)
		.set({
			status: 'queued',
			error: error.slice(0, 4000),
			leaseOwner: null,
			leaseExpiresAt: null,
			runAfter: new Date(Date.now() + backoffMs),
			updatedAt: new Date()
		})
		.where(and(eq(jobs.id, jobId), eq(jobs.leaseOwner, owner)));
}

/** Is a newer job still mutating this site? Used to keep one mutation per site. */
export async function siteHasActiveJob(siteId: string): Promise<boolean> {
	const rows = await db
		.select({ id: jobs.id })
		.from(jobs)
		.where(
			and(
				eq(jobs.siteId, siteId),
				or(eq(jobs.status, 'queued'), eq(jobs.status, 'running'))
			)
		)
		.limit(1);
	return rows.length > 0;
}
