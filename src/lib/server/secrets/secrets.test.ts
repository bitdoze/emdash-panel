import { describe, expect, it } from 'vitest';
import {
	decryptSecret,
	encryptSecret,
	generateEmdashEncryptionKey,
	generatePassword,
	masterKey
} from './index.js';

describe('encryptSecret/decryptSecret', () => {
	it('round-trips plaintext', () => {
		const blob = encryptSecret('super-secret-value');
		expect(decryptSecret(blob)).toBe('super-secret-value');
	});

	it('produces v1.<iv>.<tag>.<ct> format', () => {
		const parts = encryptSecret('x').split('.');
		expect(parts).toHaveLength(4);
		expect(parts[0]).toBe('v1');
	});

	it('uses a fresh IV per record', () => {
		expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
	});

	it('rejects tampered ciphertext (GCM auth)', () => {
		const blob = encryptSecret('payload');
		const parts = blob.split('.');
		const ct = Buffer.from(parts[3], 'base64url');
		ct[0] ^= 0xff;
		parts[3] = ct.toString('base64url');
		expect(() => decryptSecret(parts.join('.'))).toThrow();
	});

	it('rejects malformed blobs', () => {
		expect(() => decryptSecret('nope')).toThrow('Unrecognized encrypted secret format');
		expect(() => decryptSecret('v2.a.b.c')).toThrow('Unrecognized encrypted secret format');
	});
});

describe('masterKey', () => {
	it('decodes the test key to 32 bytes', () => {
		expect(masterKey()).toHaveLength(32);
	});
});

describe('generators', () => {
	it('generateEmdashEncryptionKey matches the documented format', () => {
		expect(generateEmdashEncryptionKey()).toMatch(/^emdash_enc_v1_[A-Za-z0-9_-]{43}$/);
	});

	it('generatePassword returns base64url of the requested size', () => {
		const pw = generatePassword(24);
		expect(pw).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(Buffer.from(pw, 'base64url')).toHaveLength(24);
	});
});
