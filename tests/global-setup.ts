// Remove the throwaway test database so each run is deterministic — tests
// mutate global state like the owner-exists flag by design.
import { rmSync } from 'node:fs';

export default function setup(): void {
	for (const suffix of ['', '-wal', '-shm', '-journal']) {
		rmSync(`/tmp/emdash-panel-vitest.db${suffix}`, { force: true });
	}
}
