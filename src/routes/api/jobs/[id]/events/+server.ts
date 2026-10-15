// Authenticated SSE stream of job events. Emits new job_events rows, then the
// terminal job status, and stays open for reconnects while the job runs.
import { asc, eq, gt, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db } from '#lib/server/db/index';
import { jobEvents, jobs } from '#lib/server/db/schema';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) return new Response('unauthorized', { status: 401 });
	const jobId = params.id;
	let after = Number(url.searchParams.get('after') ?? 0);
	if (Number.isNaN(after)) after = 0;

	const encoder = new TextEncoder();
	let closed = false;
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (obj: unknown) => {
				if (closed) return;
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
				} catch {
					closed = true;
				}
			};
			const poll = async () => {
				if (closed) return;
				try {
					const rows = await db
						.select()
						.from(jobEvents)
						.where(and(eq(jobEvents.jobId, jobId), gt(jobEvents.id, after)))
						.orderBy(asc(jobEvents.id))
						.limit(500);
					const job = (
						await db.select().from(jobs).where(eq(jobs.id, jobId)).limit(1)
					)[0];
					if (rows.length) {
						after = rows[rows.length - 1].id;
						send({
							kind: 'events',
							status: job?.status ?? 'unknown',
							events: rows.map((r) => ({
								id: r.id,
								ts: r.ts.toISOString(),
								level: r.level,
								message: r.message
							}))
						});
					} else {
						send({ kind: 'status', status: job?.status ?? 'unknown' });
					}
					if (job && ['succeeded', 'failed', 'cancelled'].includes(job.status)) {
						// One more flush to drain final log lines, then close.
						setTimeout(() => {
							closed = true;
							try {
								controller.enqueue(encoder.encode('event: done\ndata: {}\n\n'));
								controller.close();
							} catch {
								/* already closed */
							}
						}, 800);
						return;
					}
				} catch {
					/* transient db hiccup — keep the stream alive */
				}
				setTimeout(poll, 1000);
			};
			await poll();
		},
		cancel() {
			closed = true;
		}
	});
	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
