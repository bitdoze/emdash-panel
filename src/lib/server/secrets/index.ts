// Authenticated encryption for secrets stored in the panel database
// (site encryption keys, database passwords, object-storage credentials, …).
//
// Scheme: AES-256-GCM with a 96-bit random IV per record. The 32-byte master
// key comes from PANEL_MASTER_KEY (base64/base64url/hex) and is kept outside
// the database by the installer.
//
// Format: v1.<iv_b64url>.<tag_b64url>.<ciphertext_b64url>
//
// Worker-safe: no $app/* imports.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../env.js';

const PREFIX = 'v1';
let cachedKey: Buffer | undefined;

export function masterKey(): Buffer {
	if (cachedKey) return cachedKey;
	const raw = env('PANEL_MASTER_KEY').trim();
	let key: Buffer;
	if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
	else key = Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
	if (key.length !== 32) {
		throw new Error('PANEL_MASTER_KEY must decode to 32 bytes (base64, base64url or hex)');
	}
	cachedKey = key;
	return key;
}

export function encryptSecret(plaintext: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', masterKey(), iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return [PREFIX, iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join(
		'.'
	);
}

export function decryptSecret(blob: string): string {
	const parts = blob.split('.');
	if (parts.length !== 4 || parts[0] !== PREFIX) {
		throw new Error('Unrecognized encrypted secret format');
	}
	const [, ivB64, tagB64, ctB64] = parts;
	const decipher = createDecipheriv(
		'aes-256-gcm',
		masterKey(),
		Buffer.from(ivB64, 'base64url')
	);
	decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(ctB64, 'base64url')),
		decipher.final()
	]).toString('utf8');
}

/** Generate a random EmDash plugin-encryption key in the documented format. */
export function generateEmdashEncryptionKey(): string {
	return `emdash_enc_v1_${randomBytes(32).toString('base64url')}`;
}

/** Generate a cryptographically strong random password. */
export function generatePassword(bytes = 24): string {
	return randomBytes(bytes).toString('base64url');
}
