# Operations guide

Operational notes for a running EmDash Panel installation. Install-day commands
live in the README; this covers the parts you touch afterwards.

## Concepts

- **Sites** run as `ems-site-<id12>` containers on dedicated `ems-net-<id12>`
  networks with a persistent `ems-vol-<id12>` volume mounted at `/app/data`.
- **Caddy** terminates TLS and proxies; the worker maintains routes over the
  admin API (`/run/caddy/admin.sock`) and reconciles drift every 60s.
- **Jobs** are durable rows in the panel SQLite DB. The worker leases them,
  streams events (`job_events`), and serializes work per site.
- **Metrics** are sampled every `METRICS_MS` (default 15s) into
  `metrics_samples` and retained for `METRICS_RETENTION_S` (default 8h).

## Resource limits

Each site has `cpuMillicores` (100–8000; 1000 = one core) and `memoryMb`
(128–16384). They are applied as `NanoCpus`/`Memory` at container creation and
via `docker update` by the `site.update_limits` job — no restart. Site
containers also get `PidsLimit: 256`, `no-new-privileges`, a read-only root
filesystem, and JSON-file logs capped at 3×10 MiB.

## Per-site access logs

Caddy is configured with a named JSON logger per site
(`site-<siteId>` → `/logs/<siteId>.jsonl` on the `caddy-logs` volume). The
panel mounts that volume read-only at `SITE_LOG_DIR` (`/site-logs`) and the
site page summarizes the last 512 KiB: request counts (1h/24h), bytes, 5xx
count, top paths, and recent hits. `reconcileAccessLogs` removes loggers for
deleted sites. Log rotation is Caddy-managed (default 10 MiB × 5).

## File manager

The panel bind-mounts `/var/lib/docker/volumes` at `SITE_VOLUME_ROOT`
(`/volumes`). The file manager resolves `<volume>/_data/<path>`, rejects
traversal, and bounds reads (512 KiB preview) and uploads (64 MiB). The panel
runs as root and `chown`s every write to uid 1000 (`node`) so site containers
retain write access. All mutations are audit-logged (`site.files.*`).

Note: editing `emdash.db*` while a site runs is possible but dangerous —
SQLite may write over your changes. Stop the site first for DB surgery.

## Deployments

`site.deploy` rebuilds the site image and swaps the container:

- **Bundled template** (default): rebuilds `templates/emdash-node` with the
  site's `EMDASH_DB` build arg — offline and reproducible.
- **Git source**: Docker builds `repo.git#ref` as a remote context (the repo
  must contain a Dockerfile at its root). Set the repo at site creation or per
  deploy; on success the deployed source is stored back on the site as
  `sourceRepo`/`sourceRef`, becoming the default for future deploys.

Two entry points on the site page:

- **Deploy** — uses the repo/ref fields in the form. Each build resolves the
  ref fresh, so pushing new commits then pressing Deploy picks them up.
- **Redeploy** — one click, no fields: rebuilds the site's *stored* source
  (last-deployed git repo/ref, or the bundled template if none). Use this
  after pushing to the site's repo or after `manage.sh update` rebuilt the
  template images.

Both enqueue `site.deploy` with a `deployments` row tracking state
(`queued → building → switching → successful|failed`), the built image tag,
and which deployment is currently live (`is_current`).

On success the new image becomes current and the deployment row is marked; on
a failed health check the worker rolls the container back to the prior image.

## Updating sites to new code

- **Site code lives in a git repo**: push commits, open the site, hit
  **Redeploy** (or **Deploy** to change repo/ref). Docker's remote-context
  build fetches the repo at that ref — no local clone is kept.
- **Bundled-template sites**: the template pins EmDash in
  `templates/emdash-node`. To move sites onto a new template version, run
  `manage.sh update` (rebuilds the template images) then **Redeploy** each
  site. Containers keep their old image until redeployed.
- **Panel itself**: `manage.sh update` rebuilds and restarts the panel and
  worker.

## Backups and restore

The site page lists each site's backups (newest first) with status, size and
two download links:

- `tar.gz` — server-side decrypted plaintext archive (HTTPS; use when you
  trust this session)
- `.enc` — the raw AES-256-GCM ciphertext as stored on disk (safe to archive
  elsewhere; decrypts only with `PANEL_MASTER_KEY`)

`site.backup` produces an AES-256-GCM archive in `BACKUP_DIR`
(`/opt/emdash/backups`) containing:

- `manifest.json` — site id, engine, version, artifact names
- `.ems-snap.db` (SQLite `VACUUM INTO` snapshot) or `.ems-pg.dump`
  (`pg_dump -Fc`) — the DB artifact
- `data.tar` — the site volume (excluding live DB/WAL files for sqlite sites)

Manual restore procedure (no `site.restore` job yet):

```sh
# Decrypt — openssl, AES-256-GCM, key = PANEL_MASTER_KEY from /opt/emdash/env
# (the worker writes <key-id>.key.json metadata alongside the archive)

# SQLite site: stop the site, extract the snapshot into the volume
docker run --rm -v ems-vol-<id12>:/data -v /opt/emdash/backups:/b alpine \
  sh -c 'tar -xf /b/site-<id>.tar.gcm-decrypted -C /tmp && cp /tmp/.ems-snap.db /data/emdash.db'

# Postgres site: create the DB fresh, then
pg_restore -d postgresql://<role>:<pass>@emdashd-postgres:5432/<db> .ems-pg.dump
```

## Admin domains

Extra hostnames that serve the panel (alongside the primary `ORIGIN` host) are
managed in **Settings → Admin domains**. Adding one enqueues
`panel.sync_domains`, which rewrites the Caddy `panel` route's host matchers;
the cert is issued on first request. Removing a host re-syncs the same way.
The primary `ORIGIN` host is always included and can't be removed from the UI.

## Reconciliation

The worker's reconcile pass (60s; `manage.sh reconcile` to force) repairs:

- missing/drifted Caddy routes and setup-gate routes
- stale `site-*` access-log mappings and loggers
- site containers that restarted or lost their network wiring
- orphaned `ems-*` containers whose site row is gone

## Upgrading

`manage.sh update` rebuilds the panel image and site template images and
restarts services. Site containers keep their pinned image; redeploy a site
(`site.deploy`) to move it onto the rebuilt template.
