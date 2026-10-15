import { beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { jobs } from '../db/schema.js';
import { ensureMigrated } from '../testdb.js';
import {
	claimJob,
	enqueueJob,
	finishJob,
	renewLease,
	retryJob,
	siteHasActiveJob
} from './queue.js';

beforeAll(ensureMigrated);

const LEASE_MS = 60_000;
const OWNER = 'test-worker';

describe('job queue', () => {
	it('enqueue then claim flips status to running with a lease', async () => {
		const job = await enqueueJob('test.noop', { x: 1 });
		const claimed = await claimJob(OWNER, LEASE_MS);
		expect(claimed?.id).toBe(job.id);
		expect(claimed?.status).toBe('running');
		expect(claimed?.leaseOwner).toBe(OWNER);
		expect(claimed?.attempts).toBe(1);
		expect(claimed?.leaseExpiresAt?.getTime()).toBeGreaterThan(Date.now());
	});

	it('claim returns undefined when nothing is due', async () => {
		expect(await claimJob(OWNER, LEASE_MS)).toBeUndefined();
	});

	it('dedupeKey collapses duplicate enqueues', async () => {
		const key = `dedupe-${Date.now()}`;
		const a = await enqueueJob('test.noop', {}, { dedupeKey: key });
		const b = await enqueueJob('test.noop', {}, { dedupeKey: key });
		expect(b.id).toBe(a.id);
		await claimJob(OWNER, LEASE_MS);
	});

	it('runAfter delays claimability', async () => {
		await enqueueJob('test.noop', {}, { runAfter: new Date(Date.now() + 3_600_000) });
		expect(await claimJob(OWNER, LEASE_MS)).toBeUndefined();
	});

	it('renewLease works only for the lease owner', async () => {
		const job = await enqueueJob('test.noop');
		const claimed = await claimJob(OWNER, LEASE_MS);
		expect(claimed?.id).toBe(job.id);
		expect(await renewLease(job.id, 'other-worker', LEASE_MS)).toBe(false);
		expect(await renewLease(job.id, OWNER, LEASE_MS)).toBe(true);
		await finishJob(job.id, OWNER, { status: 'succeeded' });
	});

	it('finishJob records outcome and clears the lease', async () => {
		const job = await enqueueJob('test.noop');
		await claimJob(OWNER, LEASE_MS);
		await finishJob(job.id, OWNER, { status: 'succeeded' });
		const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
		expect(row.status).toBe('succeeded');
		expect(row.leaseOwner).toBeNull();
		expect(row.finishedAt).not.toBeNull();
	});

	it('expired leases are reclaimed and retried', async () => {
		const job = await enqueueJob('test.noop');
		await claimJob('dead-worker', LEASE_MS);
		// Simulate a crashed worker: lease expiry in the past.
		await db
			.update(jobs)
			.set({ leaseExpiresAt: new Date(Date.now() - 1000) })
			.where(eq(jobs.id, job.id));
		const reclaimed = await claimJob('new-worker', LEASE_MS);
		expect(reclaimed?.id).toBe(job.id);
		expect(reclaimed?.leaseOwner).toBe('new-worker');
		expect(reclaimed?.attempts).toBe(2);
		await finishJob(job.id, 'new-worker', { status: 'succeeded' });
	});

	it('jobs that exhaust attempts fail instead of reclaiming', async () => {
		const job = await enqueueJob('test.noop', {}, { maxAttempts: 1 });
		await claimJob('dead-worker', LEASE_MS);
		await db
			.update(jobs)
			.set({ leaseExpiresAt: new Date(Date.now() - 1000) })
			.where(eq(jobs.id, job.id));
		expect(await claimJob('new-worker', LEASE_MS)).toBeUndefined();
		const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
		expect(row.status).toBe('failed');
		expect(row.error).toContain('lease expired');
	});

	it('retryJob requeues with a backoff window', async () => {
		const job = await enqueueJob('test.noop');
		await claimJob(OWNER, LEASE_MS);
		await retryJob(job.id, OWNER, 'flaky', 60_000);
		const row = (await db.select().from(jobs).where(eq(jobs.id, job.id)))[0];
		expect(row.status).toBe('queued');
		expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
		// Not due yet → cannot be claimed.
		expect(await claimJob(OWNER, LEASE_MS)).toBeUndefined();
	});

	it('siteHasActiveJob tracks queued/running states', async () => {
		const siteId = `site-${Date.now()}`;
		expect(await siteHasActiveJob(siteId)).toBe(false);
		const job = await enqueueJob('test.noop', {}, { siteId });
		expect(await siteHasActiveJob(siteId)).toBe(true);
		const claimed = await claimJob(OWNER, LEASE_MS);
		expect(claimed?.id).toBe(job.id);
		expect(await siteHasActiveJob(siteId)).toBe(true);
		await finishJob(job.id, OWNER, { status: 'succeeded' });
		expect(await siteHasActiveJob(siteId)).toBe(false);
	});
});
