// Site lifecycle job handlers: create, delete, start/stop, complete setup,
// backup. Each step logs to job_events and is written to be safe to retry —
// resources are identified by name + labels and reconciled rather than blindly
// recreated.
import { spawn } from 'node:child_process';
import { createCipheriv, randomBytes } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { createWriteStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '../../src/lib/server/db/index.js';
import {
	domains,
	secretRecords,
	siteDatabases,
	sites,
	storageProfiles,
	backups,
	deployments
} from '../../src/lib/server/db/schema.js';
import {
	decryptSecret,
	encryptSecret,
	generateEmdashEncryptionKey,
	generatePassword,
	masterKey
} from '../../src/lib/server/secrets/index.js';
import { logJob, setJobProgress } from '../../src/lib/server/jobs/queue.js';
import { config, baseLabels, LABELS } from '../config.js';
import {
	connectCaddy,
	containerExists,
	disconnectCaddy,
	docker,
	ensureNetwork,
	ensureVolume,
	execInContainer,
	imageExists,
	pullImage,
	removeNetwork,
	removeVolume,
	waitHealthy
} from '../docker.js';
import { removeRoutes, replaceSiteRoutes, siteRoute } from '../caddy.js';
import { removeSiteAccessLog, syncSiteAccessLog } from '../caddy.js';
import { dropSiteDatabase, provisionSiteDatabase } from '../postgres.js';
import { buildGitImage, buildSiteImage } from '../build.js';

export class RetryableError extends Error {}

async function siteRow(siteId: string) {
	const rows = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1);
	if (!rows[0]) throw new Error(`Site ${siteId} not found`);
	return rows[0];
}

async function siteHostnames(siteId: string): Promise<string[]> {
	const rows = await db.select().from(domains).where(eq(domains.siteId, siteId));
	return rows.map((r) => r.hostname);
}

export function siteResourceNames(siteId: string) {
	const short = siteId.replace(/-/g, '').slice(0, 12);
	return {
		container: `ems-site-${short}`,
		network: `ems-net-${short}`,
		volume: `ems-vol-${short}`,
		pgDatabase: `ems_db_${short}`,
		pgRole: `ems_role_${short}`
	};
}

/** Remove a container only if it carries this installation's labels. */
async function removeManagedContainer(name: string): Promise<void> {
	try {
		const container = docker.getContainer(name);
		const info = await container.inspect();
		if (
			info.Config.Labels?.[LABELS.managed] === 'true' &&
			info.Config.Labels?.[LABELS.installation] === config.installationId
		) {
			await container.remove({ force: true });
		}
	} catch {
		/* does not exist */
	}
}

/** Default image ref for a site: `<siteImage>:<dbEngine>` built from the template. */
export function defaultSiteImage(site: { dbEngine: string; image?: string | null }): string {
	if (site.image) return site.image;
	const engine = site.dbEngine === 'postgres' ? 'postgres' : 'sqlite';
	return `${config.siteImage}:${engine}`;
}

async function ensureSiteImage(ref: string, jobId: string): Promise<void> {
	if (await imageExists(ref)) return;
	const [base, tag] = ref.split(':');
	if (base === config.siteImage) {
		const dbEngine = tag === 'postgres' ? 'postgres' : 'sqlite';
		await logJob(jobId, `Image ${ref} missing — building from bundled template (db=${dbEngine})`);
		await buildSiteImage(ref, { EMDASH_DB: dbEngine }, (line) => logJob(jobId, line));
		return;
	}
	await logJob(jobId, `Pulling image ${ref}`);
	await pullImage(ref, (line) => setJobProgress(jobId, `pull: ${line.slice(0, 120)}`));
}

async function externalCheck(hostname: string, timeoutMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	let lastError = 'no response';
	while (Date.now() < deadline) {
		try {
			const res = await fetch(`https://${hostname}/`, {
				signal: AbortSignal.timeout(10_000),
				redirect: 'manual'
			});
			if (res.status < 500) return;
			lastError = `HTTP ${res.status}`;
		} catch (err) {
			lastError = err instanceof Error ? err.message : String(err);
		}
		await new Promise((r) => setTimeout(r, 4000));
	}
	throw new RetryableError(`External HTTPS check for ${hostname} never succeeded: ${lastError}`);
}

export async function handleSiteCreate(jobId: string, payload: { siteId: string }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	const hostnames = await siteHostnames(site.id);
	const primary = hostnames[0];
	if (!primary) throw new Error('Site has no domain — cannot provision');

	const image = defaultSiteImage(site);
	await logJob(jobId, `Provisioning site ${site.name} (${primary}) with image ${image}`);

	// 1. Credentials first — stored encrypted, referenced by id on the site row.
	await setJobProgress(jobId, 'generating credentials');
	if (!site.encryptionKeySecretId) {
		const encKey = generateEmdashEncryptionKey();
		const [secret] = await db
			.insert(secretRecords)
			.values({
				name: `site-${site.id}-encryption-key`,
				kind: 'emdash_encryption_key',
				siteId: site.id,
				ciphertext: encryptSecret(encKey)
			})
			.returning();
		const gateUser = 'owner';
		const gatePassword = generatePassword(18);
		const [gateSecret] = await db
			.insert(secretRecords)
			.values({
				name: `site-${site.id}-setup-gate`,
				kind: 'setup_gate',
				siteId: site.id,
				ciphertext: encryptSecret(gatePassword)
			})
			.returning();
		await db
			.update(sites)
			.set({
				encryptionKeySecretId: secret.id,
				setupGateSecretId: gateSecret.id,
				setupGateUsername: gateUser,
				updatedAt: new Date()
			})
			.where(eq(sites.id, site.id));
		await logJob(jobId, 'Generated site encryption key and setup gate credential');
	}
	const refreshed = await siteRow(site.id);
	const encryptionKey = decryptSecret(
		(
			await db
				.select()
				.from(secretRecords)
				.where(eq(secretRecords.id, refreshed.encryptionKeySecretId!))
				.limit(1)
		)[0].ciphertext
	);

	// 2. Database.
	await setJobProgress(jobId, 'provisioning database');
	const envVars: Record<string, string> = {
		HOST: '0.0.0.0',
		PORT: String(config.siteInternalPort),
		EMDASH_SITE_URL: `https://${primary}`,
		EMDASH_ENCRYPTION_KEY: encryptionKey
	};
	if (site.dbEngine === 'postgres') {
		const existing = await db
			.select()
			.from(siteDatabases)
			.where(eq(siteDatabases.siteId, site.id))
			.limit(1);
		let creds;
		if (existing[0]?.credentialsSecretId) {
			const row = (
				await db
					.select()
					.from(secretRecords)
					.where(eq(secretRecords.id, existing[0].credentialsSecretId))
					.limit(1)
			)[0];
			creds = JSON.parse(decryptSecret(row.ciphertext)) as { connectionString: string };
			await logJob(jobId, `Reusing database ${existing[0].databaseName}`);
		} else {
			const provisioned = await provisionSiteDatabase(names.pgDatabase, names.pgRole);
			const [secret] = await db
				.insert(secretRecords)
				.values({
					name: `site-${site.id}-postgres`,
					kind: 'postgres_credentials',
					siteId: site.id,
					ciphertext: encryptSecret(JSON.stringify(provisioned))
				})
				.returning();
			await db.insert(siteDatabases).values({
				siteId: site.id,
				engine: 'postgres_managed',
				databaseName: provisioned.database,
				roleName: provisioned.role,
				host: provisioned.host,
				port: provisioned.port,
				credentialsSecretId: secret.id
			});
			creds = provisioned;
			await logJob(jobId, `Created PostgreSQL database ${provisioned.database} with dedicated role`);
		}
		envVars.DATABASE_URL = creds.connectionString;
		envVars.EMDASH_DB = 'postgres';
	} else {
		envVars.DATABASE_PATH = '/app/data/emdash.db';
		envVars.EMDASH_DB = 'sqlite';
	}

	// 3. Storage profile (S3 media) — credentials decrypted for the site's env.
	if (site.storageMode === 's3' && site.storageProfileId) {
		const profile = (
			await db
				.select()
				.from(storageProfiles)
				.where(eq(storageProfiles.id, site.storageProfileId))
				.limit(1)
		)[0];
		if (!profile) throw new Error('Selected storage profile not found');
		const creds = JSON.parse(
			decryptSecret(
				(
					await db
						.select()
						.from(secretRecords)
						.where(eq(secretRecords.id, profile.credentialsSecretId))
						.limit(1)
				)[0].ciphertext
			)
		) as { accessKeyId: string; secretAccessKey: string };
		envVars.EMDASH_STORAGE = 's3';
		envVars.S3_ENDPOINT = profile.endpoint;
		envVars.S3_BUCKET = profile.bucket;
		envVars.S3_REGION = profile.region;
		envVars.S3_ACCESS_KEY_ID = creds.accessKeyId;
		envVars.S3_SECRET_ACCESS_KEY = creds.secretAccessKey;
		if (profile.publicUrl) envVars.S3_PUBLIC_URL = profile.publicUrl;
		if (profile.prefix) envVars.S3_PREFIX = profile.prefix;
		await logJob(jobId, `S3 media storage via ${profile.endpoint}/${profile.bucket}`);
	}

	// 4. Docker resources — idempotent ensures so a retry can resume.
	await setJobProgress(jobId, 'creating docker resources');
	await ensureVolume(names.volume, site.id);
	await ensureNetwork(names.network, site.id);
	await removeManagedContainer(names.container);
	await ensureSiteImage(image, jobId);

	const container = await docker.createContainer({
		name: names.container,
		Image: image,
		User: 'node',
		Env: Object.entries(envVars).map(([k, v]) => `${k}=${v}`),
		Labels: baseLabels({ [LABELS.site]: site.id, [LABELS.role]: 'site' }),
		ExposedPorts: { [`${config.siteInternalPort}/tcp`]: {} },
		HostConfig: {
			Mounts: [{ Type: 'volume', Source: names.volume, Target: '/app/data' }],
			NetworkMode: names.network,
			RestartPolicy: { Name: 'unless-stopped' },
			Memory: site.memoryMb * 1024 * 1024,
			NanoCpus: site.cpuMillicores * 1_000_000,
			PidsLimit: 256,
			LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
			SecurityOpt: ['no-new-privileges'],
			ReadonlyRootfs: true,
			Tmpfs: { '/tmp': 'rw,noexec,nosuid,size=128m' }
		}
	});
	await container.start();
	await db
		.update(sites)
		.set({
			containerName: names.container,
			networkName: names.network,
			volumeName: names.volume,
			image,
			updatedAt: new Date()
		})
		.where(eq(sites.id, site.id));
	await logJob(jobId, `Container ${names.container} started`);

	// Postgres-backed sites join the shared pg network for database access only.
	if (site.dbEngine === 'postgres') {
		await ensureNetwork(config.pgNetwork);
		try {
			await docker.getNetwork(config.pgNetwork).connect({ Container: names.container });
		} catch (err) {
			if (!/already exists|already connected/i.test(String(err))) throw err;
		}
	}

	// 5. Readiness — Docker healthcheck + one real HTTP probe inside the site net.
	await setJobProgress(jobId, 'waiting for site readiness');
	if (!(await waitHealthy(names.container, config.readyTimeoutMs))) {
		throw new RetryableError('Site container did not become healthy in time');
	}
	const probe = await execInContainer(
		names.container,
		['node', '-e', `fetch('http://127.0.0.1:${config.siteInternalPort}/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))`],
		30_000
	);
	if (probe.code !== 0) throw new RetryableError('Site HTTP probe failed');
	await logJob(jobId, 'Site runtime is healthy');

	// 6. Routing — connect Caddy to the site network, then upsert routes with the
	// setup gate on /_emdash/*.
	await setJobProgress(jobId, 'configuring routes');
	await connectCaddy(names.network);
	const gateSecret = (
		await db
			.select()
			.from(secretRecords)
			.where(eq(secretRecords.id, refreshed.setupGateSecretId!))
			.limit(1)
	)[0];
	const gatePassword = decryptSecret(gateSecret.ciphertext);
	const gateHash = bcrypt.hashSync(gatePassword, 10);
	await replaceSiteRoutes(
		siteRoute({
			siteId: site.id,
			hostnames,
			upstream: `${names.container}:${config.siteInternalPort}`,
			gate: { username: refreshed.setupGateUsername!, bcryptHash: gateHash }
		})
	);
	for (const hostname of hostnames) {
		await db
			.update(domains)
			.set({ state: 'route_configured' })
			.where(eq(domains.hostname, hostname));
		await logJob(jobId, `Route configured for ${hostname}`);
	}
	// Per-site access log file on the shared caddy-logs volume.
	await syncSiteAccessLog(site.id, hostnames);

	// 7. External verification — ACME issuance happens on first request.
	await setJobProgress(jobId, 'verifying external HTTPS');
	await externalCheck(primary, config.externalCheckTimeoutMs);
	for (const hostname of hostnames) {
		await db.update(domains).set({ state: 'ready' }).where(eq(domains.hostname, hostname));
	}

	await db
		.update(sites)
		.set({ status: 'awaiting_setup', error: null, updatedAt: new Date() })
		.where(eq(sites.id, site.id));
	// Record the initial image as the site's first deployment.
	await db.insert(deployments).values({
		siteId: site.id,
		jobId,
		state: 'successful',
		image,
		gitUrl: site.sourceRepo,
		gitRef: site.sourceRef,
		isCurrent: true,
		finishedAt: new Date()
	});
	await logJob(jobId, `Site is live at https://${primary} — CMS setup is gated until claimed`);
}

export async function handleSiteDelete(jobId: string, payload: { siteId: string; purgeData?: boolean }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	const hostnames = await siteHostnames(site.id);
	await db.update(sites).set({ status: 'deleting', updatedAt: new Date() }).where(eq(sites.id, site.id));

	await removeRoutes([`site-${site.id}`, `site-${site.id}-gate`]);
	await removeSiteAccessLog(site.id).catch((err) =>
		logJob(jobId, `Access-log cleanup failed (non-fatal): ${String(err)}`, 'warn')
	);
	await disconnectCaddy(names.network);
	await removeManagedContainer(names.container);
	await removeNetwork(names.network);
	await logJob(jobId, 'Removed container, network and proxy routes');

	const pgRows = await db.select().from(siteDatabases).where(eq(siteDatabases.siteId, site.id));
	for (const row of pgRows) {
		if (row.engine === 'postgres_managed' && row.databaseName && row.roleName) {
			await dropSiteDatabase(row.databaseName, row.roleName);
			await logJob(jobId, `Dropped PostgreSQL database ${row.databaseName} and role`);
		}
	}
	await db.delete(siteDatabases).where(eq(siteDatabases.siteId, site.id));

	if (payload.purgeData) {
		await removeVolume(names.volume);
		await db.delete(secretRecords).where(eq(secretRecords.siteId, site.id));
		await logJob(jobId, 'Purged site data volume and stored secrets');
	} else {
		await logJob(jobId, `Kept data volume ${names.volume} (use --purge to remove)`);
	}

	await db.delete(domains).where(eq(domains.siteId, site.id));
	await db
		.update(sites)
		.set({ status: 'deleted', containerName: null, updatedAt: new Date() })
		.where(eq(sites.id, site.id));
}

export async function handleSiteStop(_jobId: string, payload: { siteId: string }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	if (await containerExists(names.container)) {
		await docker.getContainer(names.container).stop({ t: 10 }).catch(() => {});
	}
	await db
		.update(sites)
		.set({ status: 'stopped', updatedAt: new Date() })
		.where(eq(sites.id, site.id));
}

export async function handleSiteStart(jobId: string, payload: { siteId: string }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	if (!(await containerExists(names.container))) {
		throw new RetryableError('Container missing — run provisioning again');
	}
	await docker.getContainer(names.container).start();
	if (!(await waitHealthy(names.container, config.readyTimeoutMs))) {
		throw new RetryableError('Site did not become healthy after start');
	}
	await connectCaddy(names.network);
	await db
		.update(sites)
		.set({
			status: site.setupGateSecretId ? 'awaiting_setup' : 'ready',
			updatedAt: new Date()
		})
		.where(eq(sites.id, site.id));
	await logJob(jobId, 'Site started');
}

export async function handleSiteCompleteSetup(jobId: string, payload: { siteId: string }) {
	const site = await siteRow(payload.siteId);
	if (!site.setupGateSecretId) return;
	const hostnames = await siteHostnames(site.id);
	const names = siteResourceNames(site.id);
	// Remove the gate route and replace the main route in one config write.
	await removeRoutes([`site-${site.id}-gate`]);
	await replaceSiteRoutes(
		siteRoute({
			siteId: site.id,
			hostnames,
			upstream: `${names.container}:${config.siteInternalPort}`
		})
	);
	await db
		.update(sites)
		.set({
			status: 'ready',
			setupGateSecretId: null,
			setupGateUsername: null,
			updatedAt: new Date()
		})
		.where(eq(sites.id, site.id));
	await db
		.delete(secretRecords)
		.where(eq(secretRecords.id, site.setupGateSecretId));
	await logJob(jobId, 'Setup gate removed — site is fully public');
}

export async function handleSiteBackup(jobId: string, payload: { siteId: string; backupId: string }) {
	try {
		await runSiteBackup(jobId, payload);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await db
			.update(backups)
			.set({ status: 'failed', error: message.slice(0, 2000) })
			.where(eq(backups.id, payload.backupId))
			.catch(() => {});
		throw err;
	}
}

async function runSiteBackup(jobId: string, payload: { siteId: string; backupId: string }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	const backupId = payload.backupId;
	const ts = new Date().toISOString().replace(/[:.]/g, '-');
	const base = `${site.name}-${ts}`;

	await db.update(backups).set({ status: 'running' }).where(eq(backups.id, backupId));
	await mkdir(config.backupDir, { recursive: true });

	let dbArtifact: string;
	if (site.dbEngine === 'postgres') {
		await setJobProgress(jobId, 'dumping postgres database');
		// pg_dump from a throwaway container on the pg network, writing into the
		// site volume so the dump is captured by the archive below.
		const row = (await db.select().from(siteDatabases).where(eq(siteDatabases.siteId, site.id)).limit(1))[0];
		if (!row?.credentialsSecretId) throw new Error('Site database record missing credentials');
		const creds = JSON.parse(
			decryptSecret(
				(await db.select().from(secretRecords).where(eq(secretRecords.id, row.credentialsSecretId)).limit(1))[0]
					.ciphertext
			)
		) as { connectionString: string };
		if (!(await imageExists(config.postgresImage))) await pullImage(config.postgresImage);
		const stderrChunks: Buffer[] = [];
		const errStream = new PassThrough();
		errStream.on('data', (c: Buffer) => stderrChunks.push(c));
		const [, waitResult] = await docker.run(
			config.postgresImage,
			['pg_dump', '-Fc', '-f', '/backup/.ems-pg.dump', creds.connectionString],
			[new PassThrough(), errStream],
			{
				HostConfig: {
					AutoRemove: true,
					NetworkMode: config.pgNetwork,
					Mounts: [{ Type: 'volume', Source: names.volume, Target: '/backup' }]
				},
				Labels: baseLabels({ [LABELS.site]: site.id, [LABELS.role]: 'backup-helper' })
			}
		);
		const dumpStatus = (waitResult as { StatusCode?: number })?.StatusCode ?? 0;
		if (dumpStatus !== 0) {
			throw new Error(`pg_dump failed (exit ${dumpStatus}): ${Buffer.concat(stderrChunks).toString('utf8').slice(0, 500)}`);
		}
		dbArtifact = '.ems-pg.dump';
		await logJob(jobId, `pg_dump ${row.databaseName} complete`);
	} else {
		await setJobProgress(jobId, 'snapshotting database');
		// VACUUM INTO produces a transactionally consistent copy — never copy the
		// live .db file (WAL contents would be lost).
		const snap = await execInContainer(
			names.container,
			[
				'node',
				'-e',
				`const{DatabaseSync}=require('node:sqlite');const d=new DatabaseSync('/app/data/emdash.db');d.exec("VACUUM INTO '/app/data/.ems-snap.db'");d.close();`
			],
			120_000
		);
		if (snap.code !== 0) throw new Error(`SQLite snapshot failed: ${snap.output}`);
		dbArtifact = '.ems-snap.db';
	}

	await setJobProgress(jobId, 'archiving data volume');
	// Archive everything except the live sqlite files — only the consistent
	// snapshot/dump is backed up (see docs/operations.md for restore steps).
	const pack = await execInContainer(
		names.container,
		[
			'sh',
			'-c',
			`cd /app/data && mkdir -p uploads && tar -czf /tmp/site-backup.tar.gz --exclude='./emdash.db' --exclude='./emdash.db-*' . && mv /tmp/site-backup.tar.gz /app/data/.ems-backup.tar.gz`
		],
		300_000
	);
	if (pack.code !== 0) throw new Error(`Archive failed: ${pack.output}`);

	// Stream the archive out of the container, encrypting as we go.
	const archiveStream = await docker
		.getContainer(names.container)
		.getArchive({ path: '/app/data/.ems-backup.tar.gz' });
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
	const encPath = `${config.backupDir}/${base}.tar.gz.enc`;
	// getArchive wraps the file in an (uncompressed) tar — stream it through tar
	// extraction so we never hold the archive in memory. The extracted member is
	// the .tar.gz produced above; we encrypt those bytes as-is.
	await new Promise<void>((resolve, reject) => {
		const extract = spawn('tar', ['-xOf', '-']);
		archiveStream.pipe(extract.stdin);
		const out = createWriteStream(encPath);
		extract.stdout.pipe(cipher).pipe(out);
		let errBuf = '';
		extract.stderr.on('data', (c) => (errBuf += c));
		out.on('finish', resolve);
		out.on('error', reject);
		extract.on('error', reject);
		extract.on('close', (code) => {
			if (code !== 0) reject(new Error(`tar extract failed: ${errBuf}`));
		});
	});
	const tag = cipher.getAuthTag();
	// Record iv+tag alongside the file so the format stays self-describing.
	const manifest = {
		format: 'emdash-panel-backup/v1',
		site: { id: site.id, name: site.name },
		image: site.image,
		dbEngine: site.dbEngine,
		createdAt: new Date().toISOString(),
		dbArtifact,
		encryption: { scheme: 'aes-256-gcm', iv: iv.toString('base64url'), tag: tag.toString('base64url') }
	};
	await writeFile(`${encPath}.manifest.json`, JSON.stringify(manifest, null, 2));
	// Clean the staged artifacts inside the container.
	await execInContainer(
		names.container,
		['rm', '-f', '/app/data/.ems-backup.tar.gz', '/app/data/.ems-snap.db', '/app/data/.ems-pg.dump'],
		30_000
	).catch(() => {});

	const size = (await stat(encPath)).size;
	await db
		.update(backups)
		.set({
			status: 'complete',
			objectKey: encPath,
			sizeBytes: size,
			manifest: JSON.stringify(manifest)
		})
		.where(eq(backups.id, backupId));
	await logJob(jobId, `Backup written to ${encPath} (${size} bytes)`);
}

/**
 * Live-update a site container's CPU/memory limits. `docker update` applies
 * cgroup limits without a restart — no downtime.
 */
export async function handleSiteUpdateLimits(
	jobId: string,
	payload: { siteId: string; cpuMillicores: number; memoryMb: number }
) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	const cpu = Math.min(Math.max(Math.trunc(payload.cpuMillicores), 100), 8_000);
	const mem = Math.min(Math.max(Math.trunc(payload.memoryMb), 128), 16_384);

	if (!(await containerExists(names.container))) {
		throw new Error('Container does not exist — provision the site first');
	}
	await docker.getContainer(names.container).update({
		NanoCpus: cpu * 1_000_000,
		Memory: mem * 1024 * 1024,
		// MemorySwap must be >= Memory or -1 (unlimited swap within the cap).
		MemorySwap: -1
	});
	await db
		.update(sites)
		.set({ cpuMillicores: cpu, memoryMb: mem, updatedAt: new Date() })
		.where(eq(sites.id, site.id));
	await logJob(jobId, `Limits updated: ${cpu / 1000} CPU, ${mem} MiB memory`);
}

/**
 * Build and deploy a new image for a site — from its git source, or the bundled
 * template when no source is set. The container is recreated with the same
 * env, volume, network and limits; on failure the previous image is restored.
 */
export async function handleSiteDeploy(jobId: string, payload: { siteId: string; deploymentId: string }) {
	const site = await siteRow(payload.siteId);
	const names = siteResourceNames(site.id);
	const [dep] = await db
		.select()
		.from(deployments)
		.where(eq(deployments.id, payload.deploymentId))
		.limit(1);
	if (!dep || dep.siteId !== site.id) throw new Error('Deployment not found');
	const oldImage = site.image ?? defaultSiteImage(site);
	const fail = async (message: string) => {
		await db
			.update(deployments)
			.set({ state: 'failed', error: message.slice(0, 2000), finishedAt: new Date() })
			.where(eq(deployments.id, dep.id));
		throw new Error(message);
	};

	// 1. Build (or pull) the candidate image.
	const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
	const tag = `ems-deploy-${names.container.slice(9)}:${stamp}`;
	try {
		await db.update(deployments).set({ state: 'building' }).where(eq(deployments.id, dep.id));
		if (dep.gitUrl) {
			await logJob(jobId, `Building ${dep.gitUrl}${dep.gitRef ? `#${dep.gitRef}` : ''}`);
			await buildGitImage(tag, dep.gitUrl, dep.gitRef ?? undefined, {}, (line) =>
				logJob(jobId, line)
			);
		} else {
			await logJob(jobId, `Rebuilding bundled template (${site.dbEngine})`);
			await buildSiteImage(tag, { EMDASH_DB: site.dbEngine }, (line) => logJob(jobId, line));
		}
	} catch (err) {
		await fail(`Image build failed: ${err instanceof Error ? err.message : String(err)}`);
		return;
	}

	// 2. Capture the running container's config, then swap in the new image.
	await db.update(deployments).set({ state: 'switching' }).where(eq(deployments.id, dep.id));
	const oldInfo = await docker.getContainer(names.container).inspect();
	const shared = {
		Env: oldInfo.Config.Env,
		Labels: oldInfo.Config.Labels,
		User: oldInfo.Config.User,
		ExposedPorts: oldInfo.Config.ExposedPorts,
		HostConfig: oldInfo.HostConfig
	};
	await removeManagedContainer(names.container);
	try {
		const container = await docker.createContainer({
			name: names.container,
			Image: tag,
			...shared
		});
		await container.start();
		if (!(await waitHealthy(names.container, config.readyTimeoutMs))) {
			throw new Error('New container did not become healthy');
		}
	} catch (err) {
		// Roll back to the previous image.
		await removeManagedContainer(names.container);
		try {
			const back = await docker.createContainer({ name: names.container, Image: oldImage, ...shared });
			await back.start();
			await waitHealthy(names.container, config.readyTimeoutMs);
			await logJob(jobId, `Rollback: restored ${oldImage}`, 'warn');
		} catch (rollbackErr) {
			await fail(
				`Deploy failed and rollback also failed: ${String(rollbackErr)}`
			);
			return;
		}
		await fail(`Deploy failed, rolled back to ${oldImage}: ${err instanceof Error ? err.message : String(err)}`);
		return;
	}

	// 3. Mark the deployment current.
	await db.update(deployments).set({ isCurrent: false }).where(eq(deployments.siteId, site.id));
	const img = await docker.getImage(tag).inspect().catch(() => undefined);
	await db
		.update(deployments)
		.set({
			state: 'successful',
			image: tag,
			imageDigest: img?.Id ?? null,
			isCurrent: true,
			finishedAt: new Date()
		})
		.where(eq(deployments.id, dep.id));
	await db
		.update(sites)
		.set({ image: tag, updatedAt: new Date() })
		.where(eq(sites.id, site.id));
	await logJob(jobId, `Deployment live on ${tag}`);
}
