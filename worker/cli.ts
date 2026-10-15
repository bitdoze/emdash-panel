// Management CLI — invoked by install.sh / manage.sh on the host, inside the
// worker container via `docker compose exec worker cli <cmd>`.
import { createSetupToken, isOwnerInitialized } from '../src/lib/server/auth/owner.js';
import { runMigrations } from './migrate.js';
import { reconcile } from './reconcile.js';
import { docker } from './docker.js';
import { getConfig } from './caddy.js';
import { db } from '../src/lib/server/db/index.js';
import { sites, jobs } from '../src/lib/server/db/schema.js';
import { count } from 'drizzle-orm';

const [cmd, ...args] = process.argv.slice(2);

function flag(name: string): string | undefined {
	const idx = args.indexOf(`--${name}`);
	return idx >= 0 ? args[idx + 1] : undefined;
}

switch (cmd) {
	case 'migrate': {
		await runMigrations();
		console.log('migrations applied');
		break;
	}
	case 'create-setup-token': {
		await runMigrations();
		if (await isOwnerInitialized()) {
			console.error('Owner account already exists; setup tokens are no longer usable.');
			process.exit(1);
		}
		const ttl = Number(flag('ttl') ?? 30);
		const token = await createSetupToken(ttl);
		console.log(token);
		break;
	}
	case 'reconcile': {
		const report = await reconcile();
		console.log(JSON.stringify(report, null, 2));
		break;
	}
	case 'status': {
		let dockerOk = false;
		let caddyOk = false;
		try {
			await docker.ping();
			dockerOk = true;
		} catch {
			/* unreachable */
		}
		try {
			await getConfig();
			caddyOk = true;
		} catch {
			/* unreachable */
		}
		const siteCount = (await db.select({ n: count() }).from(sites))[0]?.n ?? 0;
		const jobCount = (await db.select({ n: count() }).from(jobs))[0]?.n ?? 0;
		console.log(
			JSON.stringify(
				{ docker: dockerOk, caddy: caddyOk, sites: siteCount, jobs: jobCount, ownerInitialized: await isOwnerInitialized() },
				null,
				2
			)
		);
		break;
	}
	default:
		console.log(`Usage: cli <command>

  migrate                run panel database migrations
  create-setup-token     print a single-use owner setup token (--ttl minutes)
  reconcile              run one reconciliation pass
  status                 docker/caddy/db health summary
`);
		process.exit(cmd ? 1 : 0);
}
