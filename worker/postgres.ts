// Managed PostgreSQL provisioning. The worker connects with the administrative
// credential (POSTGRES_ADMIN_URL); sites only ever receive their own role.
//
// Per-site layout: one database + one canonical owning role. The role gets
// CONNECT on its database and USAGE+CREATE on schema `public`, so it can run
// EmDash migrations for the life of the site. PUBLIC access is revoked.
import pg from 'pg';
import { generatePassword } from '../src/lib/server/secrets/index.js';
import { config } from './config.js';

const IDENT_RE = /^[a-z][a-z0-9_]{0,62}$/;

function assertIdent(value: string): string {
	if (!IDENT_RE.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
	return value;
}

function adminClient(database = 'postgres'): pg.Client {
	if (!config.postgresAdminUrl) throw new Error('Managed PostgreSQL is not enabled');
	const url = new URL(config.postgresAdminUrl);
	url.pathname = `/${database}`;
	return new pg.Client({ connectionString: url.toString() });
}

export interface ProvisionedDatabase {
	database: string;
	role: string;
	password: string;
	host: string;
	port: number;
	connectionString: string;
}

export async function provisionSiteDatabase(dbName: string, roleName: string) {
	assertIdent(dbName);
	assertIdent(roleName);
	const password = generatePassword(24);
	const client = adminClient();
	await client.connect();
	try {
		await client.query(`CREATE ROLE ${roleName} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${password.replaceAll("'", "''")}'`);
		await client.query(`CREATE DATABASE ${dbName} OWNER ${roleName}`);
	} finally {
		await client.end().catch(() => {});
	}
	const scoped = adminClient(dbName);
	await scoped.connect();
	try {
		await scoped.query(`REVOKE ALL ON DATABASE ${dbName} FROM PUBLIC`);
		await scoped.query(`GRANT CONNECT ON DATABASE ${dbName} TO ${roleName}`);
		await scoped.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`);
		await scoped.query(`GRANT USAGE, CREATE ON SCHEMA public TO ${roleName}`);
	} finally {
		await scoped.end().catch(() => {});
	}
	const host = new URL(config.postgresAdminUrl!).hostname;
	const port = Number(new URL(config.postgresAdminUrl!).port || 5432);
	return {
		database: dbName,
		role: roleName,
		password,
		host,
		port,
		connectionString: `postgres://${roleName}:${encodeURIComponent(password)}@${host}:${port}/${dbName}`
	} satisfies ProvisionedDatabase;
}

export async function dropSiteDatabase(dbName: string, roleName: string): Promise<void> {
	assertIdent(dbName);
	assertIdent(roleName);
	const client = adminClient();
	await client.connect();
	try {
		await client.query(
			`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`,
			[dbName]
		);
		await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
		await client.query(`DROP ROLE IF EXISTS ${roleName}`);
	} finally {
		await client.end().catch(() => {});
	}
}
