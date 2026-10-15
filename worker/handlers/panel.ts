// panel.sync_domains — rewrites the panel route's host matcher so extra admin
// domains (stored in settings key "panel.domains") also reach the panel.
// Caddy provisions certificates for new hosts automatically on next request.
import { eq } from 'drizzle-orm';
import { db } from '../../src/lib/server/db/index.js';
import { settings } from '../../src/lib/server/db/schema.js';
import { env } from '../../src/lib/server/env.js';
import { getConfig, loadConfig, CaddyError } from '../caddy.js';
import { config } from '../config.js';
import { logJob } from '../../src/lib/server/jobs/queue.js';

const PANEL_ROUTE_ID = 'panel';
const SETTINGS_KEY = 'panel.domains';

export async function handlePanelSyncDomains(jobId: string, _payload: never): Promise<void> {
	const primary = new URL(env('ORIGIN')).hostname;
	const row = (
		await db.select().from(settings).where(eq(settings.key, SETTINGS_KEY)).limit(1)
	)[0];
	let extra: string[] = [];
	try {
		extra = row ? (JSON.parse(row.value) as string[]) : [];
	} catch {
		extra = [];
	}
	const hosts = [...new Set([primary, ...extra.map((h) => h.toLowerCase())])].sort();
	await logJob(jobId, `Panel hosts: ${hosts.join(', ')}`);

	for (let attempt = 0; attempt < 3; attempt++) {
		const { config: cfg, etag } = await getConfig();
		const server = cfg.apps?.http?.servers?.[config.caddyServer];
		if (!server) throw new Error(`Caddy config has no HTTP server named ${config.caddyServer}`);
		server.routes ??= [];

		const idx = server.routes.findIndex((r) => r['@id'] === PANEL_ROUTE_ID);
		if (idx >= 0) {
			const route = server.routes[idx] as { match?: { host?: string[] }[] };
			const cur = [...(route.match?.[0]?.host ?? [])].sort();
			if (JSON.stringify(cur) === JSON.stringify(hosts)) return;
			route.match = [{ host: hosts }];
		} else {
			// Bootstrap didn't define it — prepend a plain proxy route.
			server.routes.unshift({
				'@id': PANEL_ROUTE_ID,
				match: [{ host: hosts }],
				handle: [
					{
						handler: 'reverse_proxy',
						upstreams: [{ dial: 'panel:3000' }]
					}
				],
				terminal: true
			});
		}
		try {
			await loadConfig(cfg, etag);
			return;
		} catch (err) {
			if (err instanceof CaddyError && err.status === 409 && attempt < 2) continue;
			throw err;
		}
	}
}
