// Panel database migrations. Safe to run from multiple processes concurrently:
// callers retry on SQLITE_BUSY and the migrator itself is idempotent.
import { migrate } from 'drizzle-orm/libsql/migrator';
import { db } from '../src/lib/server/db/index.js';
import { envOpt } from '../src/lib/server/env.js';

const MIGRATIONS_FOLDER = envOpt('MIGRATIONS_FOLDER', 'drizzle')!;

export async function runMigrations(maxAttempts = 15): Promise<void> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
			return;
		} catch (err) {
			lastError = err;
			const message = err instanceof Error ? err.message : String(err);
			// "already exists" covers the rare case where another migrator's
			// journal check raced our apply — retrying sees the applied journal.
			if (!/busy|locked|already exists/i.test(message)) throw err;
			const delay = Math.min(1_000 * attempt, 5_000);
			console.warn(`[migrate] database busy (attempt ${attempt}), retrying in ${delay}ms`);
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	throw lastError;
}
