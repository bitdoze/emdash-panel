import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";
import emdash from "emdash/astro";
import { sqlite } from "emdash/db";

// ems-runtime/* virtual imports resolve to ./src/runtime/*.mjs — plain modules
// bundled by Vite, no node_modules lookup needed at container start.
const runtimeDir = fileURLToPath(new URL("./src/runtime", import.meta.url));

// Runtime contract for panel-managed sites.
//
// astro.config.mjs is evaluated at BUILD time, so the database dialect "type"
// is fixed per image variant via the EMDASH_DB build-time env (sqlite |
// postgres). The postgres variant uses the ems-runtime/db entrypoint, whose
// createDialect reads DATABASE_URL at container start; migrations resolve the
// connection string from the DATABASE_URL env var as well.
//
// Storage is fully runtime-dispatched: ems-runtime/storage reads
// EMDASH_STORAGE (local | s3), EMDASH_DATA_DIR and S3_* when the container
// runs, so one image serves both modes.
//
// Runtime env (read per-request/startup): EMDASH_SITE_URL, EMDASH_ENCRYPTION_KEY,
// DATABASE_URL / DATABASE_PATH, EMDASH_STORAGE + S3_*, PORT, HOST.
const DB = process.env.EMDASH_DB ?? "sqlite";

const database =
	DB === "postgres"
		? {
				entrypoint: "ems-runtime/db",
				type: "postgres",
				config: {},
				migrations: {
					entrypoint: "emdash/internal/db/postgres-migrations",
					manifestConfig: { connectionStringEnv: "DATABASE_URL" },
				},
			}
		: // SQLite lives on the persistent site volume at a fixed path.
			sqlite({ url: "file:/app/data/emdash.db" });

export default defineConfig({
	vite: {
		resolve: {
			alias: { "ems-runtime": runtimeDir },
		},
	},
	output: "server",
	adapter: node({
		mode: "standalone",
	}),
	image: {
		layout: "constrained",
		responsiveStyles: true,
	},
	integrations: [
		react(),
		emdash({
			database,
			storage: { entrypoint: "ems-runtime/storage", config: {} },
			sandboxRunner: "@emdash-cms/sandbox-workerd/sandbox",
		}),
	],
	devToolbar: { enabled: false },
});
