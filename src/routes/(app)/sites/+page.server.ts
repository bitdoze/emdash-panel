import { desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '#lib/server/db/index';
import { domains, sites } from '#lib/server/db/schema';

export const load: PageServerLoad = async () => {
	const allSites = await db.select().from(sites).orderBy(desc(sites.createdAt));
	const allDomains = await db.select().from(domains);
	const bySite = new Map<string, string[]>();
	for (const d of allDomains) {
		bySite.set(d.siteId, [...(bySite.get(d.siteId) ?? []), d.hostname]);
	}
	return {
		sites: allSites
			.filter((s) => s.status !== 'deleted')
			.map((s) => ({
				id: s.id,
				name: s.name,
				status: s.status,
				dbEngine: s.dbEngine,
				storageMode: s.storageMode,
				image: s.image,
				error: s.error,
				domains: bySite.get(s.id) ?? [],
				createdAt: s.createdAt.toISOString()
			}))
	};
};
