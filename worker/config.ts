// Worker configuration derived from the environment.
import { randomBytes } from 'node:crypto';
import { env, envInt, envOpt } from '../src/lib/server/env.js';

export const WORKER_ID = `worker-${randomBytes(4).toString('hex')}`;

export const config = {
	dockerSocket: envOpt('DOCKER_SOCKET', '/var/run/docker.sock')!,
	caddyAdminSocket: envOpt('CADDY_ADMIN_SOCKET', '/run/caddy/admin.sock')!,
	/** Name of the Caddy HTTP server that owns site routes in the bootstrap config. */
	caddyServer: envOpt('CADDY_SERVER_NAME', 'main')!,
	/** Caddy container name/id, connected to per-site networks for proxying. */
	caddyContainer: envOpt('CADDY_CONTAINER', 'emdashd-caddy')!,
	/** Docker network shared by postgres + postgres-backed sites. */
	pgNetwork: envOpt('PG_NETWORK', 'emdashd-pg')!,
	/** Admin connection URL for the managed PostgreSQL service, when enabled. */
	postgresAdminUrl: envOpt('POSTGRES_ADMIN_URL'),
	/** Image used for throwaway pg_dump containers during postgres backups. */
	postgresImage: envOpt('POSTGRES_IMAGE', 'postgres:18-alpine')!,
	/**
	 * Base name for bundled site images — sites get `<base>:<dbEngine>` and the
	 * worker builds that tag from templates/emdash-node on demand. Full image
	 * overrides are still allowed via the site's `image` field.
	 */
	siteImage: envOpt('EMDASH_SITE_IMAGE', 'emdashd-site')!,
	/** Image reference allowed to be requested per-site (validated). */
	siteImageOverridePattern: envOpt('EMDASH_SITE_IMAGE_PATTERN', '^[a-z0-9][a-z0-9._/:@-]{0,199}$')!,
	installationId: envOpt('INSTALLATION_ID', 'local')!,
	backupDir: envOpt('BACKUP_DIR', '/backups')!,
	/** Internal port the EmDash runtime listens on inside its container. */
	siteInternalPort: envInt('SITE_INTERNAL_PORT', 4321),
	jobLeaseMs: envInt('JOB_LEASE_MS', 60_000),
	pollMs: envInt('WORKER_POLL_MS', 1_500),
	reconcileMs: envInt('RECONCILE_MS', 60_000),
	metricsMs: envInt('METRICS_MS', 15_000),
	metricsRetentionMs: envInt('METRICS_RETENTION_MS', 8 * 60 * 60_000),
	externalCheckTimeoutMs: envInt('EXTERNAL_CHECK_TIMEOUT_MS', 120_000),
	readyTimeoutMs: envInt('SITE_READY_TIMEOUT_MS', 180_000)
} as const;

export const LABELS = {
	managed: 'emdash.panel/managed',
	site: 'emdash.panel/site',
	installation: 'emdash.panel/installation',
	role: 'emdash.panel/role'
} as const;

export function baseLabels(extra: Record<string, string> = {}): Record<string, string> {
	return {
		[LABELS.managed]: 'true',
		[LABELS.installation]: config.installationId,
		...extra
	};
}
