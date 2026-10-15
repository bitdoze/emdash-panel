// Runtime database dialect for panel-managed EmDash sites.
//
// Astro resolves astro.config.mjs at *build* time, so a plain
// `postgres({ connectionString: process.env.DATABASE_URL })` would bake the
// value — or undefined — into the image. This entrypoint is imported by the
// generated virtual dialect module and reads the real environment when the
// container runs. The descriptor's `type` is still fixed at build time, so
// only use this entrypoint in the postgres image variant.
import { createDialect as createPostgres } from "emdash/db/postgres";
import { createDialect as createSqlite } from "emdash/db/sqlite";

export function createDialect(config) {
	if (process.env.EMDASH_DB === "postgres") {
		return createPostgres({
			connectionString: process.env.DATABASE_URL,
			pool: { min: 0, max: 10, connectionTimeoutMillis: 10000 },
			...config,
		});
	}
	// Defensive fallback — a postgres-type image should always get EMDASH_DB.
	const path = process.env.DATABASE_PATH ?? "/app/data/emdash.db";
	return createSqlite({ url: path.startsWith("file:") ? path : `file:${path}` });
}
