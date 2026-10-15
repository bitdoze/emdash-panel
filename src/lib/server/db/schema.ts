// Panel database schema.
//
// IMPORTANT: this file is imported by the operations worker, which runs outside
// SvelteKit. Keep it free of $app/*, $env/*, and client-only imports.
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date());

const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date());

/* ------------------------------------------------------------------ */
/* Sites                                                               */
/* ------------------------------------------------------------------ */

export const SITE_STATUSES = [
	'provisioning',
	'awaiting_setup',
	'ready',
	'stopped',
	'error',
	'deleting',
	'deleted'
] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const sites = sqliteTable('sites', {
	id: id(),
	name: text('name').notNull(),
	status: text('status', { enum: SITE_STATUSES }).notNull().default('provisioning'),
	dbEngine: text('db_engine', { enum: ['sqlite', 'postgres'] })
		.notNull()
		.default('sqlite'),
	storageMode: text('storage_mode', { enum: ['local', 's3'] })
		.notNull()
		.default('local'),
	storageProfileId: text('storage_profile_id'),
	image: text('image'),
	containerName: text('container_name'),
	networkName: text('network_name'),
	volumeName: text('volume_name'),
	encryptionKeySecretId: text('encryption_key_secret_id'),
	setupGateSecretId: text('setup_gate_secret_id'),
	setupGateUsername: text('setup_gate_username'),
	lockJobId: text('lock_job_id'),
	lockExpiresAt: integer('lock_expires_at', { mode: 'timestamp' }),
	error: text('error'),
	createdAt: createdAt(),
	updatedAt: updatedAt()
});

export const DOMAIN_STATES = [
	'pending',
	'dns_pending',
	'route_configured',
	'cert_pending',
	'ready',
	'error'
] as const;
export type DomainState = (typeof DOMAIN_STATES)[number];

export const domains = sqliteTable(
	'domains',
	{
		id: id(),
		siteId: text('site_id')
			.notNull()
			.references(() => sites.id, { onDelete: 'cascade' }),
		hostname: text('hostname').notNull(),
		isPrimary: integer('is_primary', { mode: 'boolean' }).notNull().default(false),
		state: text('state', { enum: DOMAIN_STATES }).notNull().default('pending'),
		error: text('error'),
		createdAt: createdAt()
	},
	(t) => [uniqueIndex('domains_hostname_unique').on(t.hostname)]
);

export const DEPLOYMENT_STATES = [
	'queued',
	'preparing',
	'building',
	'migrating',
	'starting',
	'verifying',
	'switching',
	'draining',
	'successful',
	'failed',
	'cancelled'
] as const;
export type DeploymentState = (typeof DEPLOYMENT_STATES)[number];

export const deployments = sqliteTable(
	'deployments',
	{
		id: id(),
		siteId: text('site_id')
			.notNull()
			.references(() => sites.id, { onDelete: 'cascade' }),
		jobId: text('job_id'),
		state: text('state', { enum: DEPLOYMENT_STATES }).notNull().default('queued'),
		image: text('image'),
		imageDigest: text('image_digest'),
		commitSha: text('commit_sha'),
		isCurrent: integer('is_current', { mode: 'boolean' }).notNull().default(false),
		error: text('error'),
		createdAt: createdAt(),
		finishedAt: integer('finished_at', { mode: 'timestamp' })
	},
	(t) => [index('deployments_site_idx').on(t.siteId)]
);

/* ------------------------------------------------------------------ */
/* Durable job queue                                                   */
/* ------------------------------------------------------------------ */

export const JOB_STATUSES = [
	'queued',
	'running',
	'succeeded',
	'failed',
	'cancelled'
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const jobs = sqliteTable(
	'jobs',
	{
		id: id(),
		type: text('type').notNull(),
		payload: text('payload').notNull().default('{}'),
		status: text('status', { enum: JOB_STATUSES }).notNull().default('queued'),
		siteId: text('site_id'),
		dedupeKey: text('dedupe_key'),
		attempts: integer('attempts').notNull().default(0),
		maxAttempts: integer('max_attempts').notNull().default(5),
		leaseOwner: text('lease_owner'),
		leaseExpiresAt: integer('lease_expires_at', { mode: 'timestamp' }),
		progress: text('progress'),
		runAfter: integer('run_after', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		error: text('error'),
		createdBy: text('created_by'),
		createdAt: createdAt(),
		updatedAt: updatedAt(),
		finishedAt: integer('finished_at', { mode: 'timestamp' })
	},
	(t) => [
		index('jobs_status_run_after_idx').on(t.status, t.runAfter),
		index('jobs_site_idx').on(t.siteId),
		uniqueIndex('jobs_dedupe_key_unique').on(t.dedupeKey)
	]
);

export const jobEvents = sqliteTable(
	'job_events',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		jobId: text('job_id')
			.notNull()
			.references(() => jobs.id, { onDelete: 'cascade' }),
		ts: integer('ts', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		level: text('level', { enum: ['info', 'warn', 'error'] })
			.notNull()
			.default('info'),
		message: text('message').notNull()
	},
	(t) => [index('job_events_job_idx').on(t.jobId, t.id)]
);

/* ------------------------------------------------------------------ */
/* Databases                                                           */
/* ------------------------------------------------------------------ */

export const siteDatabases = sqliteTable('site_databases', {
	id: id(),
	siteId: text('site_id')
		.notNull()
		.references(() => sites.id, { onDelete: 'cascade' }),
	engine: text('engine', { enum: ['sqlite', 'postgres_managed', 'postgres_external'] })
		.notNull(),
	// postgres: database name + owning role; sqlite: file path inside the site volume
	databaseName: text('database_name'),
	roleName: text('role_name'),
	host: text('host'),
	port: integer('port'),
	credentialsSecretId: text('credentials_secret_id'),
	createdAt: createdAt()
});

/* ------------------------------------------------------------------ */
/* Storage profiles                                                    */
/* ------------------------------------------------------------------ */

export const storageProfiles = sqliteTable('storage_profiles', {
	id: id(),
	name: text('name').notNull(),
	kind: text('kind', { enum: ['media', 'backup'] })
		.notNull()
		.default('media'),
	endpoint: text('endpoint').notNull(),
	region: text('region').notNull().default('auto'),
	bucket: text('bucket').notNull(),
	prefix: text('prefix').notNull().default(''),
	publicUrl: text('public_url'),
	credentialsSecretId: text('credentials_secret_id').notNull(),
	createdAt: createdAt()
});

/* ------------------------------------------------------------------ */
/* Secrets                                                             */
/* ------------------------------------------------------------------ */

export const secretRecords = sqliteTable('secret_records', {
	id: id(),
	name: text('name').notNull(),
	kind: text('kind').notNull(),
	siteId: text('site_id'),
	// v1.<iv_b64url>.<tag_b64url>.<ct_b64url> — see lib/server/secrets
	ciphertext: text('ciphertext').notNull(),
	createdAt: createdAt(),
	rotatedAt: integer('rotated_at', { mode: 'timestamp' })
});

/* ------------------------------------------------------------------ */
/* Backups                                                             */
/* ------------------------------------------------------------------ */

export const backups = sqliteTable(
	'backups',
	{
		id: id(),
		siteId: text('site_id')
			.notNull()
			.references(() => sites.id, { onDelete: 'cascade' }),
		jobId: text('job_id'),
		status: text('status', { enum: ['pending', 'running', 'complete', 'failed'] })
			.notNull()
			.default('pending'),
		destination: text('destination', { enum: ['local', 's3'] })
			.notNull()
			.default('local'),
		objectKey: text('object_key'),
		sizeBytes: integer('size_bytes'),
		manifest: text('manifest'),
		error: text('error'),
		createdAt: createdAt(),
		verifiedAt: integer('verified_at', { mode: 'timestamp' })
	},
	(t) => [index('backups_site_idx').on(t.siteId)]
);

/* ------------------------------------------------------------------ */
/* Setup tokens, settings, audit, metrics                              */
/* ------------------------------------------------------------------ */

export const setupTokens = sqliteTable('setup_tokens', {
	id: id(),
	tokenHash: text('token_hash').notNull(),
	label: text('label').notNull().default('owner-setup'),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
	consumedAt: integer('consumed_at', { mode: 'timestamp' }),
	createdAt: createdAt()
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const auditEvents = sqliteTable(
	'audit_events',
	{
		id: id(),
		actorId: text('actor_id'),
		action: text('action').notNull(),
		targetType: text('target_type'),
		targetId: text('target_id'),
		metadata: text('metadata'),
		ip: text('ip'),
		createdAt: createdAt()
	},
	(t) => [index('audit_events_created_idx').on(t.createdAt)]
);

export const metricsSamples = sqliteTable(
	'metrics_samples',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		ts: integer('ts', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		payload: text('payload').notNull()
	},
	(t) => [index('metrics_samples_ts_idx').on(t.ts)]
);

export * from './auth.schema';
