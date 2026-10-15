import { beforeAll, describe, expect, it } from 'vitest';
import { db } from '../db/index.js';
import { user } from '../db/auth.schema.js';
import { setupTokens } from '../db/schema.js';
import { ensureMigrated } from '../testdb.js';
import {
	consumeSetupToken,
	createSetupToken,
	isOwnerInitialized,
	validateSetupToken
} from './owner.js';

beforeAll(ensureMigrated);

describe('setup tokens', () => {
	it('create → validate → consume → single-use', async () => {
		const token = await createSetupToken();
		expect(token).toMatch(/^emp_setup_[A-Za-z0-9_-]+$/);
		expect(await validateSetupToken(token)).toBe(true);
		expect(await consumeSetupToken(token)).toBe(true);
		// consumed: neither validate nor a second consume may succeed
		expect(await validateSetupToken(token)).toBe(false);
		expect(await consumeSetupToken(token)).toBe(false);
	});

	it('expired tokens are unusable', async () => {
		const token = await createSetupToken(-1);
		expect(await validateSetupToken(token)).toBe(false);
		expect(await consumeSetupToken(token)).toBe(false);
	});

	it('garbage tokens are unusable', async () => {
		expect(await validateSetupToken('emp_setup_nonexistent')).toBe(false);
		expect(await consumeSetupToken('')).toBe(false);
	});

	it('stores only the hash, never the plaintext', async () => {
		const token = await createSetupToken();
		const rows = await db.select().from(setupTokens);
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
			expect(row.tokenHash).not.toBe(token);
		}
	});

	// Keep this last in the file: once a user row exists the whole token flow
	// must shut down (single-owner model).
	it('tokens become invalid once an owner exists', async () => {
		await db.insert(user).values({
			id: 'test-owner',
			name: 'Owner',
			email: 'owner@test.local'
		});
		expect(await isOwnerInitialized()).toBe(true);
		const token = await createSetupToken();
		expect(await validateSetupToken(token)).toBe(false);
		expect(await consumeSetupToken(token)).toBe(false);
	});
});
