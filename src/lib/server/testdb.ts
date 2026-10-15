// Test helper: apply migrations once per worker process before db tests run.
// DATABASE_URL points at a throwaway file (see vite.config.ts server project).
import { runMigrations } from '../../../worker/migrate.js';

let migrated: Promise<void> | undefined;

export function ensureMigrated(): Promise<void> {
	migrated ??= runMigrations();
	return migrated;
}
