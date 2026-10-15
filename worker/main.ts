// Operations worker entrypoint.
//
// Claims durable jobs from the panel database, runs handlers under an expiring
// lease, and performs periodic reconciliation + metrics sampling. Long-running
// or privileged work lives here — the web process never touches Docker.
import { WORKER_ID, config } from './config.js';
import { claimJob, finishJob, logJob, renewLease, retryJob, type JobRecord } from '../src/lib/server/jobs/queue.js';
import { runMigrations } from './migrate.js';
import { reconcile } from './reconcile.js';
import { sampleMetrics } from './metrics.js';
import {
	handleSiteBackup,
	handleSiteCompleteSetup,
	handleSiteCreate,
	handleSiteDelete,
	handleSiteStart,
	handleSiteStop,
	RetryableError
} from './handlers/sites.js';
import { docker } from './docker.js';

type Handler = (jobId: string, payload: never) => Promise<void>;

const HANDLERS: Record<string, Handler> = {
	'site.create': handleSiteCreate as Handler,
	'site.delete': handleSiteDelete as Handler,
	'site.start': handleSiteStart as Handler,
	'site.stop': handleSiteStop as Handler,
	'site.complete_setup': handleSiteCompleteSetup as Handler,
	'site.backup': handleSiteBackup as Handler
};

let running = true;
let activeJob: Promise<void> | undefined;

async function runJob(job: JobRecord): Promise<void> {
	const handler = HANDLERS[job.type];
	const heartbeat = setInterval(() => {
		void renewLease(job.id, WORKER_ID, config.jobLeaseMs).catch(() => {});
	}, Math.max(5_000, config.jobLeaseMs / 3));
	try {
		if (!handler) throw new Error(`Unknown job type ${job.type}`);
		const payload = JSON.parse(job.payload) as never;
		await logJob(job.id, `Worker ${WORKER_ID} started ${job.type} (attempt ${job.attempts})`);
		await handler(job.id, payload);
		await finishJob(job.id, WORKER_ID, { status: 'succeeded' });
		await logJob(job.id, `${job.type} succeeded`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		const retryable = err instanceof RetryableError;
		await logJob(job.id, `${job.type} failed: ${message}`, 'error');
		if (retryable && job.attempts < job.maxAttempts) {
			await retryJob(job.id, WORKER_ID, message, Math.min(30_000, 5_000 * job.attempts));
		} else {
			await finishJob(job.id, WORKER_ID, { status: 'failed', error: message });
		}
	} finally {
		clearInterval(heartbeat);
	}
}

async function main(): Promise<void> {
	console.log(`[worker] ${WORKER_ID} starting (installation=${config.installationId})`);
	await runMigrations();
	console.log('[worker] migrations applied');

	// Wait for Docker + Caddy to be reachable before claiming work.
	for (;;) {
		try {
			await docker.ping();
			break;
		} catch {
			console.warn('[worker] docker not ready, retrying in 3s');
			await new Promise((r) => setTimeout(r, 3_000));
		}
	}

	// Startup reconciliation — the process may be recovering from a restart.
	try {
		const report = await reconcile();
		console.log('[worker] startup reconcile:', JSON.stringify(report));
	} catch (err) {
		console.warn('[worker] startup reconcile failed:', err);
	}

	let lastReconcile = Date.now();
	let lastMetrics = 0;

	while (running) {
		// One active job at a time keeps side effects predictable on a small VPS;
		// the queue serializes everything else.
		const job = await claimJob(WORKER_ID, config.jobLeaseMs).catch((err) => {
			console.warn('[worker] claim failed:', err);
			return undefined;
		});
		if (job) {
			activeJob = runJob(job);
			await activeJob;
			continue;
		}
		if (Date.now() - lastReconcile > config.reconcileMs) {
			lastReconcile = Date.now();
			try {
				const report = await reconcile();
				if (report.restarted.length || report.routesFixed.length || report.routesRemoved.length) {
					console.log('[worker] reconcile:', JSON.stringify(report));
				}
			} catch (err) {
				console.warn('[worker] reconcile failed:', err);
			}
		}
		if (Date.now() - lastMetrics > config.metricsMs) {
			lastMetrics = Date.now();
			await sampleMetrics().catch((err) => console.warn('[worker] metrics:', err));
		}
		await new Promise((r) => setTimeout(r, config.pollMs));
	}
}

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
	process.on(sig, () => {
		console.log(`[worker] ${sig} received, shutting down`);
		running = false;
		void activeJob?.finally(() => process.exit(0));
		setTimeout(() => process.exit(0), 15_000).unref();
	});
}

main().catch((err) => {
	console.error('[worker] fatal:', err);
	process.exit(1);
});
