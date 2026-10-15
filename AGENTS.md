# EmDash Panel — agent notes

Single-VPS hosting panel for EmDash CMS. SvelteKit panel + `tsx` worker +
SQLite/Drizzle + Docker + Caddy. MIT licensed.

## Commands

```bash
npm run check        # svelte-check (must be 0 errors before committing)
npm test             # vitest server unit tests (writes ./.test-panel.db)
npm run build        # production build
npx tsx worker/cli.ts migrate           # apply drizzle migrations
npx drizzle-kit generate                # regenerate migrations after schema edits
docker build -f deploy/Dockerfile -t emdashd-panel .   # panel+worker image
```

On a live install, `/opt/emdash/scripts/manage.sh status|logs|reconcile|update`.

## Layout

- `src/lib/server/` — db (drizzle), jobs queue, secrets (AES-256-GCM), auth
  (better-auth + passkeys), audit, validate, metrics, sitelogs, files
- `worker/` — job handlers (`handlers/sites.ts`), docker, caddy, reconcile,
  metrics sampler, build (bundled template + git remote context), entrypoint
- `templates/emdash-node/` — the bundled EmDash site image source
- `deploy/` — Dockerfile (one image: `node build` panel / `tsx worker` worker),
  compose.yaml, caddy-bootstrap.json
- `docs/operations.md` — restore procedure, log/limits/file-manager details

## Conventions

- Svelte 5 runes (`$props`, `$derived`, `$state`); TypeScript everywhere.
- Server imports use the `#lib/...` alias. UI uses theme tokens from
  `src/routes/layout.css` (`bg-ink`, `bg-panel`, `bg-panel-2`, `border-line`,
  `text-mute`, `bg-accent`, `text-ok/warn/bad`) — not raw slate/sky colors.
- All mutations go through the job queue (`enqueueJob`) — the panel process
  never touches docker/caddy itself. Handlers live in `worker/handlers/`.
- Schema changes: edit `src/lib/server/db/schema.ts`, then
  `npx drizzle-kit generate` and commit the migration.

## Gotchas (learned on a live VPS)

- Caddy JSON is native config — never pass `--adapter json` to `caddy run`.
- Route matchers: host + path must be in ONE matcher object (`{host, path}`)
  for AND semantics; separate objects are OR'd. The `authentication` handler
  can't contain `routes` — wrap auth+proxy in a `subroute`.
- Compose interpolates `${VAR:?}` even for inactive profiles — use `:-` with
  safe defaults for optional services (postgres profile).
- PostgreSQL 18 requires its volume at `/var/lib/postgresql`, not
  `/var/lib/postgresql/data`.
- The worker has no HTTP server — its healthcheck greps `metrics_samples`
  freshness; `ts` is Unix **seconds** (compare `Date.now() - ts*1000`).
- Panel + worker both migrate the shared SQLite DB at boot — serialized via
  `flock` in `worker/entrypoint.sh`.
- Site containers run as uid 1000 on a read-only rootfs; the panel runs as
  root and chowns file-manager writes to 1000.
- Build-time env: `astro.config.mjs` database selection is baked at build —
  `EMDASH_DB` is a build arg, `EMDASH_SITE_URL`/S3 settings are runtime env.
- Docker git remote contexts: `dockerode` `buildImage` accepts `remote` =
  `repo.git#ref`; the daemon clones it (needs network + git inside the
  *daemon*, not the worker).
