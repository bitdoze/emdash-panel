// Input validation helpers. Worker-safe (no $app/* imports).
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { domains } from './db/schema.js';
import { envOpt } from './env.js';

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const SITE_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeHostname(input: string): string {
	return input.trim().toLowerCase().replace(/\.$/, '');
}

export function isValidHostname(hostname: string): boolean {
	return HOSTNAME_RE.test(hostname);
}

export function isValidSiteName(name: string): boolean {
	return SITE_NAME_RE.test(name);
}

export function panelHostname(): string | undefined {
	const origin = envOpt('ORIGIN');
	if (!origin) return undefined;
	try {
		return new URL(origin).hostname;
	} catch {
		return undefined;
	}
}

export async function hostnameInUse(hostname: string): Promise<boolean> {
	const rows = await db
		.select({ id: domains.id })
		.from(domains)
		.where(eq(domains.hostname, hostname))
		.limit(1);
	return rows.length > 0;
}

export function validateSiteDomain(hostname: string): string | null {
	if (!isValidHostname(hostname)) return 'Enter a valid hostname such as site1.example.com';
	if (hostname === panelHostname()) return 'This hostname belongs to the panel itself';
	return null;
}

/* ---- Resource limits + git source validation ---- */

export const LIMITS = {
	cpuMillicores: { min: 100, max: 8_000, default: 1_000 },
	memoryMb: { min: 128, max: 16_384, default: 512 }
} as const;

export function parseCpuMillicores(raw: string): number | null {
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	const v = Math.trunc(n);
	return v >= LIMITS.cpuMillicores.min && v <= LIMITS.cpuMillicores.max ? v : null;
}

export function parseMemoryMb(raw: string): number | null {
	const n = Number(raw);
	if (!Number.isFinite(n)) return null;
	const v = Math.trunc(n);
	return v >= LIMITS.memoryMb.min && v <= LIMITS.memoryMb.max ? v : null;
}

/** Git source URL — https/ssh/git URLs only; no local paths or file://. */
const GIT_URL_RE =
	/^(https:\/\/[\w.-]+(?::\d+)?\/[\w.~/-]+|git@[\w.-]+:[\w.~/-]+|git:\/\/[\w.-]+(?::\d+)?\/[\w.~/-]+)$/;

export function isValidGitUrl(url: string): boolean {
	return url.length <= 500 && GIT_URL_RE.test(url);
}

const GIT_REF_RE = /^[\w][\w./-]{0,99}$/;

export function isValidGitRef(ref: string): boolean {
	return GIT_REF_RE.test(ref) && !ref.includes('..');
}
