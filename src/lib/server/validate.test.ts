import { beforeAll, describe, expect, it } from 'vitest';
import { db } from './db/index.js';
import { domains, sites } from './db/schema.js';
import { ensureMigrated } from './testdb.js';
import {
	hostnameInUse,
	isValidHostname,
	isValidSiteName,
	normalizeHostname,
	panelHostname,
	validateSiteDomain
} from './validate.js';

beforeAll(ensureMigrated);

describe('normalizeHostname', () => {
	it('lowercases, trims, strips trailing dot', () => {
		expect(normalizeHostname('  Site1.EmDashHQ.com. ')).toBe('site1.emdashhq.com');
	});
});

describe('isValidHostname', () => {
	it('accepts valid hostnames', () => {
		expect(isValidHostname('site1.emdashhq.com')).toBe(true);
		expect(isValidHostname('a-b.c-d.example.org')).toBe(true);
	});

	it('rejects invalid hostnames', () => {
		for (const bad of [
			'',
			'localhost',
			'UPPER.example.com',
			'-bad.example.com',
			'bad-.example.com',
			'a..b.com',
			'no_underscores.example.com',
			'x'.repeat(254) + '.com'
		]) {
			expect(isValidHostname(bad)).toBe(false);
		}
	});
});

describe('isValidSiteName', () => {
	it('accepts slug-like names', () => {
		expect(isValidSiteName('site-one')).toBe(true);
		expect(isValidSiteName('a')).toBe(true);
	});

	it('rejects non-slug names', () => {
		expect(isValidSiteName('Site One')).toBe(false);
		expect(isValidSiteName('-lead')).toBe(false);
		expect(isValidSiteName('trail-')).toBe(false);
		expect(isValidSiteName('under_score')).toBe(false);
	});
});

describe('panelHostname / validateSiteDomain', () => {
	it('reads the hostname from ORIGIN', () => {
		expect(panelHostname()).toBe('panel.test');
	});

	it('rejects the panel hostname itself', () => {
		expect(validateSiteDomain('panel.test')).toContain('panel itself');
	});

	it('rejects malformed domains and accepts good ones', () => {
		expect(validateSiteDomain('not a domain')).toBeTruthy();
		expect(validateSiteDomain('site1.example.com')).toBeNull();
	});
});

describe('hostnameInUse', () => {
	it('detects claimed hostnames', async () => {
		const [site] = await db.insert(sites).values({ name: 'val-site' }).returning();
		const host = `used-${Date.now()}.example.com`;
		expect(await hostnameInUse(host)).toBe(false);
		await db.insert(domains).values({ siteId: site.id, hostname: host });
		expect(await hostnameInUse(host)).toBe(true);
	});
});
