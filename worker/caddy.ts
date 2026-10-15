// Caddy admin API client over the protected Unix socket.
//
// All mutations go through whole-config read-modify-write with the config ETag
// (If-Match), so unrelated routes can't be clobbered by a stale read. Routes are
// identified with stable @id values.
import http from 'node:http';
import { config } from './config.js';

interface CaddyRoute {
	'@id'?: string;
	match?: Array<Record<string, unknown>>;
	handle?: Array<Record<string, unknown>>;
	terminal?: boolean;
	[key: string]: unknown;
}

interface CaddyConfig {
	apps?: {
		http?: {
			servers?: Record<string, { routes?: CaddyRoute[]; [k: string]: unknown }>;
		};
	};
	[key: string]: unknown;
}

export class CaddyError extends Error {
	constructor(
		message: string,
		readonly status: number,
		readonly body: string
	) {
		super(message);
	}
}

function request(
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {}
): Promise<{ status: number; etag?: string; body: string }> {
	return new Promise((resolve, reject) => {
		const payload = body === undefined ? undefined : JSON.stringify(body);
		const req = http.request(
			{
				socketPath: config.caddyAdminSocket,
				method,
				path,
				headers: {
					'content-type': 'application/json',
					...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
					...headers
				}
			},
			(res) => {
				const chunks: Buffer[] = [];
				res.on('data', (c) => chunks.push(c));
				res.on('end', () =>
					resolve({
						status: res.statusCode ?? 0,
						etag: res.headers.etag,
						body: Buffer.concat(chunks).toString('utf8')
					})
				);
			}
		);
		req.on('error', reject);
		req.setTimeout(15_000, () => req.destroy(new Error('Caddy admin request timed out')));
		if (payload) req.write(payload);
		req.end();
	});
}

async function requestJson<T = unknown>(
	method: string,
	path: string,
	body?: unknown,
	headers: Record<string, string> = {}
): Promise<T> {
	const res = await request(method, path, body, headers);
	if (res.status >= 400) {
		throw new CaddyError(`Caddy ${method} ${path} failed: ${res.status}`, res.status, res.body);
	}
	return (res.body ? JSON.parse(res.body) : null) as T;
}

export async function getConfig(): Promise<{ config: CaddyConfig; etag?: string }> {
	const res = await request('GET', '/config/');
	if (res.status >= 400) {
		throw new CaddyError('Failed to read Caddy config', res.status, res.body);
	}
	return { config: JSON.parse(res.body || '{}') as CaddyConfig, etag: res.etag };
}

async function loadConfig(cfg: CaddyConfig, etag?: string): Promise<void> {
	const res = await request('POST', '/load', cfg, etag ? { 'If-Match': etag } : {});
	// 200 = applied. 412-style conflicts (missing etag match) surface as 400/409.
	if (res.status === 400 && /etag|concurrency/i.test(res.body)) {
		throw new CaddyError('Caddy config changed concurrently', 409, res.body);
	}
	if (res.status >= 400) {
		throw new CaddyError('Failed to load Caddy config', res.status, res.body);
	}
}

function routesOf(cfg: CaddyConfig): CaddyRoute[] {
	const server = cfg.apps?.http?.servers?.[config.caddyServer];
	if (!server) {
		throw new Error(`Caddy config has no HTTP server named ${config.caddyServer}`);
	}
	server.routes ??= [];
	return server.routes;
}

/** Upsert routes by @id, preserving the position of an existing same-id route. */
export async function upsertRoutes(newRoutes: CaddyRoute[]): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const { config: cfg, etag } = await getConfig();
		const routes = routesOf(cfg);
		for (const route of newRoutes) {
			const routeId = route['@id'];
			const idx = routeId ? routes.findIndex((r) => r['@id'] === routeId) : -1;
			if (idx >= 0) routes[idx] = route;
			else routes.push(route);
		}
		try {
			return await loadConfig(cfg, etag);
		} catch (err) {
			if (err instanceof CaddyError && err.status === 409 && attempt < 2) continue;
			throw err;
		}
	}
}

/** Remove routes by @id. Missing ids are ignored. */
export async function removeRoutes(routeIds: string[]): Promise<void> {
	if (routeIds.length === 0) return;
	for (let attempt = 0; attempt < 3; attempt++) {
		const { config: cfg, etag } = await getConfig();
		const routes = routesOf(cfg);
		const remaining = routes.filter((r) => !routeIds.includes(r['@id'] ?? ''));
		if (remaining.length === routes.length) return;
		cfg.apps!.http!.servers![config.caddyServer].routes = remaining;
		try {
			return await loadConfig(cfg, etag);
		} catch (err) {
			if (err instanceof CaddyError && err.status === 409 && attempt < 2) continue;
			throw err;
		}
	}
}

/** Reverse-proxy routes for a site's public hostnames (all in one matcher). */
export function siteRoute(opts: {
	siteId: string;
	hostnames: string[];
	upstream: string;
	gate?: { username: string; bcryptHash: string };
}): CaddyRoute[] {
	const proxy = { handler: 'reverse_proxy', upstreams: [{ dial: opts.upstream }] };
	const routes: CaddyRoute[] = [];
	// Sort so the stored matcher is stable regardless of caller ordering.
	const hosts = [...opts.hostnames].sort();

	if (opts.gate) {
		// Gate the CMS surface (/_emdash/*: admin, API, media file serving) behind
		// a generated credential until the owner finishes first-run setup.
		// IMPORTANT: the gate route must precede the terminal host route — see
		// replaceSiteRoutes, which removes then re-adds to keep this ordering.
		routes.push({
			'@id': `site-${opts.siteId}-gate`,
			// host+path must share one matcher object — separate objects are OR'ed.
			match: [{ host: hosts, path: ['/_emdash*'] }],
			handle: [
				{
					// The authentication handler can't carry subroutes; wrap in a
					// subroute so auth runs before the proxy.
					handler: 'subroute',
					routes: [
						{
							handle: [
								{
									handler: 'authentication',
									providers: {
										http_basic: {
											accounts: [
												{ username: opts.gate.username, password: opts.gate.bcryptHash }
											],
											hash_cache: {}
										}
									}
								}
							]
						},
						{ handle: [proxy] }
					]
				}
			],
			terminal: true
		});
	}

	routes.push({
		'@id': `site-${opts.siteId}`,
		match: [{ host: hosts }],
		handle: [proxy],
		terminal: true
	});
	return routes;
}

/**
 * Replace a site's routes atomically-ish: remove the existing ids first so the
 * gate route never lands behind the terminal catch-all (upsert preserves the
 * position of existing routes and appends new ones).
 */
export async function replaceSiteRoutes(newRoutes: CaddyRoute[]): Promise<void> {
	const ids = newRoutes.map((r) => r['@id']).filter((v): v is string => typeof v === 'string');
	await removeRoutes(ids);
	await upsertRoutes(newRoutes);
}

export async function listRouteIds(): Promise<string[]> {
	const { config: cfg } = await getConfig();
	return routesOf(cfg)
		.map((r) => r['@id'])
		.filter((v): v is string => typeof v === 'string');
}
