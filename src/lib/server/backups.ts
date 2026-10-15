// Backup archive access for downloads. Files are AES-256-GCM ciphertext of a
// .tar.gz; iv+tag live in <path>.manifest.json (emdash-panel-backup/v1).
import { createDecipheriv } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { masterKey } from './secrets/index.js';

export interface BackupManifest {
	format: string;
	encryption?: { scheme: string; iv: string; tag: string };
}

export async function readManifest(path: string): Promise<BackupManifest> {
	return JSON.parse(await readFile(`${path}.manifest.json`, 'utf8')) as BackupManifest;
}

/** Raw encrypted stream (the .enc file as stored on disk). */
export async function encryptedStream(path: string): Promise<Readable> {
	await stat(path);
	return createReadStream(path);
}

/** Decrypted stream of the inner .tar.gz. GCM tag is verified at stream end. */
export async function decryptedStream(path: string): Promise<Readable> {
	const manifest = await readManifest(path);
	if (!manifest.encryption) throw new Error('Backup manifest has no encryption block');
	const decipher = createDecipheriv(
		'aes-256-gcm',
		masterKey(),
		Buffer.from(manifest.encryption.iv, 'base64url')
	);
	decipher.setAuthTag(Buffer.from(manifest.encryption.tag, 'base64url'));
	return createReadStream(path).pipe(decipher);
}
