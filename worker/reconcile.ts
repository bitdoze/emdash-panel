// Reconcile the database's desired state with actual Docker and Caddy state.
// Runs at worker start and periodically. Never destroys data volumes.
import { eq, inArray } from 'drizzle-orm';
import { db } from '../src/lib/server/db/index.js';
import { domains, secretRecords, sites } from '../src/lib/server/db/schema.js';
import { decryptSecret } from '../src/lib/server/secrets/index.js';
import { baseLabels, config, LABELS } from './config.js';
import {
	connectCaddy,
	docker,
	listManagedContainers,
	removeNetwork
} from './docker.js';
import { getConfig, removeRoutes, replaceSiteRoutes, siteRoute } from './caddy.js';
import bcrypt from 'bcryptjs';
import { siteResourceNames } from './handlers/sites.js';

interface ReconcileReport {
	restarted: string[];
	routesFixed: string[];
	routesRemoved: string[];
	networksFixed: string[];
	orphanContainers: string[];
	warnings: string[];
}

export async function reconcile(): Promise<ReconcileReport> {
	const report: ReconcileReport = {
		restarted: [],
		routesFixed: [],
		routesRemoved: [],
		networksFixed: [],
		orphanContainers: [],
		warnings: []
	};

	const allSites = await db.select().from(sites);
	const liveSites = allSites.filter((s) => ['ready', 'awaiting_setup', 'provisioning'].includes(s.status));
	const siteIds = new Set(allSites.map((s) => s.id));

	// 1. Containers: restart stopped live sites; flag orphans.
	let containers: Awaited<ReturnType<typeof listManagedContainers>> = [];
	try {
		containers = await listManagedContainers();
	} catch (err) {
		report.warnings.push(`docker unavailable: ${String(err)}`);
		return report;
	}
	const byName = new Map(containers.map((c) => [c.Names[0]?.replace(/^\//, ''), c]));

	for (const site of liveSites) {
		if (!site.containerName) continue;
		const info = byName.get(site.containerName);
		if (!info) {
			report.warnings.push(`container ${site.containerName} missing for site ${site.id}`);
			continue;
		}
		if (site.status === 'provisioning') continue;
		if (info.State !== 'running') {
			try {
				await docker.getContainer(site.containerName).start();
				report.restarted.push(site.containerName);
			} catch (err) {
				report.warnings.push(`failed to restart ${site.containerName}: ${String(err)}`);
			}
		}
	}

	for (const info of containers) {
		const siteId = info.Labels?.[LABELS.site];
		if (siteId && !siteIds.has(siteId)) {
			report.orphanContainers.push(info.Names[0]?.replace(/^\//, '') ?? info.Id);
		}
	}

	// 2. Networks: ensure caddy is connected to every live site's network.
	for (const site of liveSites) {
		if (!site.networkName || site.status === 'provisioning') continue;
		try {
			await connectCaddy(site.networkName);
		} catch (err) {
			report.warnings.push(`caddy connect ${site.networkName}: ${String(err)}`);
		}
	}

	// 3. Caddy routes: ensure every live site's route exists and matches the
	//    desired shape; remove routes for sites that are gone.
	try {
		const { config: caddyCfg } = await getConfig();
		const currentRoutes =
			caddyCfg.apps?.http?.servers?.[config.caddyServer]?.routes ?? [];
		const routeById = new Map(
			currentRoutes
				.filter((r) => typeof r['@id'] === 'string')
				.map((r) => [r['@id'] as string, r])
		);
		const routeIds = new Set(routeById.keys());

		const dialOf = (route: Record<string, unknown>): unknown => {
			const handlers = (route.handle ?? []) as Record<string, unknown>[];
			// The gate wraps the proxy inside an authentication handler; the plain
			// route has the proxy directly.
			const first = handlers[0] ?? {};
			const nested = first.routes as Record<string, unknown>[] | undefined;
			const proxy = (nested?.[0]?.handle as Record<string, unknown>[] | undefined)?.[0] ?? first;
			return (proxy.upstreams as { dial: string }[] | undefined)?.[0]?.dial;
		};
		const routeMatches = (a: Record<string, unknown>, b: Record<string, unknown>) =>
			JSON.stringify(a.match ?? []) === JSON.stringify(b.match ?? []) &&
			dialOf(a) === dialOf(b);

		for (const site of liveSites) {
			if (!site.containerName || site.status === 'provisioning') continue;
			const siteDomains = await db.select().from(domains).where(eq(domains.siteId, site.id));
			if (siteDomains.length === 0) continue;
			const wantGate = !!site.setupGateSecretId;
			let gateSecret: { username: string; bcryptHash: string } | undefined;
			if (wantGate) {
				const secret = (
					await db
						.select()
						.from(secretRecords)
						.where(eq(secretRecords.id, site.setupGateSecretId!))
						.limit(1)
				)[0];
				if (secret) {
					gateSecret = {
						username: site.setupGateUsername!,
						bcryptHash: bcrypt.hashSync(decryptSecret(secret.ciphertext), 10)
					};
				}
			}
			const upstream = `${site.containerName}:${config.siteInternalPort}`;
			const expected = siteRoute({
				siteId: site.id,
				hostnames: siteDomains.map((d) => d.hostname),
				upstream,
				gate: gateSecret
			});
			const mainId = `site-${site.id}`;
			const gateId = `site-${site.id}-gate`;
			const mainActual = routeById.get(mainId);
			const gateActual = routeById.get(gateId);
			const expectedMain = expected[expected.length - 1];
			const expectedGate = wantGate ? expected[0] : undefined;
			const needsWrite =
				!mainActual ||
				!routeMatches(expectedMain, mainActual) ||
				Boolean(expectedGate) !== Boolean(gateActual) ||
				(expectedGate && gateActual && !routeMatches(expectedGate, gateActual));
			if (needsWrite) {
				await replaceSiteRoutes(expected);
				report.routesFixed.push(...siteDomains.map((d) => d.hostname));
			}
			// Route exists → domain is routable once its cert resolves.
			for (const d of siteDomains) {
				if (d.state === 'pending' || d.state === 'dns_pending') {
					await db.update(domains).set({ state: 'route_configured' }).where(eq(domains.id, d.id));
				}
			}
		}
		// Remove routes for site ids that no longer exist.
		const stale = [...routeIds].filter((id) => {
			const m = /^site-([0-9a-f-]{36})(-gate)?$/.exec(id);
			return m && !siteIds.has(m[1]);
		});
		if (stale.length) {
			await removeRoutes(stale);
			report.routesRemoved.push(...stale);
		}
	} catch (err) {
		report.warnings.push(`caddy reconcile failed: ${String(err)}`);
	}

	// 4. Networks for deleted sites.
	const networkNames = new Set(liveSites.map((s) => s.networkName).filter(Boolean));
	try {
		const nets = await docker.listNetworks({
			filters: {
				label: [`${LABELS.managed}=true`, `${LABELS.installation}=${config.installationId}`]
			}
		});
		for (const net of nets) {
			if (!networkNames.has(net.Name)) {
				await removeNetwork(net.Name);
				report.networksFixed.push(net.Name);
			}
		}
	} catch (err) {
		report.warnings.push(`network sweep failed: ${String(err)}`);
	}

	return report;
}
