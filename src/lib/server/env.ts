// Server environment access.
//
// IMPORTANT: this module must stay importable outside SvelteKit (the operations
// worker, the management CLI, and the Better Auth schema generator all load it),
// so it reads process.env directly and lazily loads a local .env as a
// convenience for development. Do not import $app/* or $env/* here.
import { existsSync, readFileSync } from 'node:fs';

let dotenvLoaded = false;

function loadDotEnv(): void {
	if (dotenvLoaded) return;
	dotenvLoaded = true;
	if (!existsSync('.env')) return;
	for (const raw of readFileSync('.env', 'utf8').split('\n')) {
		const line = raw.trim();
		if (!line || line.startsWith('#')) continue;
		const eq = line.indexOf('=');
		if (eq === -1) continue;
		const key = line.slice(0, eq).trim();
		let value = line.slice(eq + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (key && !(key in process.env)) process.env[key] = value;
	}
}

/** Read a required environment variable; throws when missing or empty. */
export function env(name: string): string {
	loadDotEnv();
	const value = process.env[name];
	if (value === undefined || value === '') {
		throw new Error(`Missing required environment variable ${name}`);
	}
	return value;
}

/** Read an environment variable, returning fallback (or undefined) when unset. */
export function envOpt(name: string, fallback?: string): string | undefined {
	loadDotEnv();
	const value = process.env[name];
	if (value === undefined || value === '') return fallback;
	return value;
}

export function envInt(name: string, fallback: number): number {
	const raw = envOpt(name);
	if (raw === undefined) return fallback;
	const parsed = Number.parseInt(raw, 10);
	if (Number.isNaN(parsed)) throw new Error(`Environment variable ${name} is not an integer`);
	return parsed;
}
