# EmDash Panel

A single-VPS hosting panel for [EmDash CMS](https://emdashcms.com) sites. Create
EmDash sites on subdomains, get HTTPS automatically, run them on SQLite or a
managed PostgreSQL, gate each site's CMS admin until its owner completes
first-run setup, and keep encrypted per-site backups — all from one web UI.

MIT licensed. Status: early release, functional end-to-end.

## What it does

- **Site provisioning** — each site runs in its own Docker container with a
  dedicated network and persistent volume, wired into Caddy automatically.
- **HTTPS + routing** — Caddy terminates TLS with automatic certificates for
  the panel and every site domain (HTTP-01/TLS-ALPN).
- **Setup gate** — new sites are publicly served immediately, but `/_emdash/*`
  (admin, API, media) sits behind a generated credential until the site's owner
  finishes EmDash first-run setup.
- **Databases** — SQLite in the site volume, or managed PostgreSQL with a
  per-site database and role (`--with-postgres`).
- **Storage** — local volumes by default; S3-compatible object storage profiles
  are configurable per site.
- **Backups** — consistent snapshots (`VACUUM INTO` for SQLite, `pg_dump -Fc`
  for PostgreSQL) written as AES-256-GCM encrypted archives with a manifest.
  Each site's page lists its backups with one-click downloads — either the raw
  `.enc` archive or a server-side decrypted `.tar.gz`.
- **Jobs** — all mutations run as durable jobs on a lease-based queue with
  retries, live log streaming (SSE), and per-site serialization.
- **Resource limits** — per-site CPU (millicores) and memory caps, applied at
  container creation and adjustable live without restart.
- **Observability** — host CPU/memory/load/disk and per-container CPU, memory
  and network I/O are sampled every 15s and rendered as graphs on the
  dashboard and each site's detail page.
- **Traffic logs** — Caddy writes per-site JSON access logs; each site's page
  shows request counts, bandwidth, error rates, top paths and recent hits.
- **File manager** — browse, edit, upload, download and delete files in a
  site's data volume directly from the panel.
- **Deployments** — rebuild a site from the bundled template or from a git
  repository (`repo.git#ref`) with automatic rollback on failed health checks.
  **Deploy** takes an explicit repo/ref; **Redeploy** one-click rebuilds the
  site's last-used source (pull latest git commits or rebuild the template).
- **Panel domains** — additional hostnames that serve the panel UI can be
  added/removed from Settings; Caddy routes are synced by a worker job.
- **Auth** — single-owner Better Auth login with passkey support. Owner creation
  is gated by a one-time CLI-issued setup token; there is no public signup.
- **Ops** — reconciliation loop repairs drifted routes/networks/containers,
  host + container metrics are sampled into the panel DB.

## Architecture

```
┌────────────┐   ┌──────────────┐   ┌─────────────────────────────┐
│   Caddy    │──▶│  emdashd-panel│   │ site containers (emdashd-site:*) │
│  :80/:443  │   │  SvelteKit :3000│ │   dedicated net + volume    │
│ admin.sock │   └──────────────┘   └─────────────────────────────┘
└─────▲──────┘           │ enqueue jobs            ▲
      │ unix socket      ▼                         │ docker.sock
      │            ┌──────────────┐   managed pg   │
      └────────────│ emdashd-worker│── emdashd-postgres ──▶
                   └──────────────┘
```

The web process is unprivileged: it validates requests, writes the panel
database (SQLite), and enqueues jobs. The worker holds the Docker socket and
Caddy admin socket and does all privileged work.

## Requirements

- Ubuntu/Debian-ish Linux VPS, ports 80/443 free
- Docker with the Compose plugin (the installer can install it)
- DNS: your panel hostname (e.g. `panel.example.com`) and any site hostnames
  resolving to the VPS — a wildcard `*.example.com` record is the easy path

## Install

```sh
# from a checkout
sudo bash scripts/install.sh --local /path/to/emdash-dash --hostname panel.example.com

# also run managed PostgreSQL for postgres-backed sites
sudo bash scripts/install.sh --local /path/to/emdash-dash --hostname panel.example.com --with-postgres
```

The installer verifies DNS, generates secrets (`/opt/emdash/env`), builds the
panel and site images, starts Caddy + panel + worker, waits for health, and
prints a **single-use owner setup token** (60-minute expiry). Open
`https://panel.example.com/setup`, paste the token, and create the owner
account.

Re-running the installer is idempotent — existing secrets, volumes and data
are preserved.

## Managing the installation

```sh
/opt/emdash/scripts/manage.sh status      # containers + panel/worker status
/opt/emdash/scripts/manage.sh logs        # follow logs (all services)
/opt/emdash/scripts/manage.sh token       # mint a fresh setup token (pre-owner)
/opt/emdash/scripts/manage.sh reconcile   # force a reconcile pass
/opt/emdash/scripts/manage.sh restart [svc]
/opt/emdash/scripts/manage.sh update      # re-pull/rebuild + restart
/opt/emdash/scripts/manage.sh uninstall [--purge]
```

## Layout

| Path | Purpose |
| --- | --- |
| `src/` | SvelteKit panel (Svelte 5 + Tailwind v4 + shadcn-svelte components) |
| `worker/` | operations worker (job handlers, Docker, Caddy, reconciler, CLI) |
| `templates/emdash-node/` | EmDash site image template (`EMDASH_DB=sqlite\|postgres` build arg) |
| `deploy/` | Dockerfile, compose.yaml, Caddy bootstrap |
| `scripts/` | installer + management script |
| `drizzle/` | panel DB migrations |

## Development

```sh
npm install
cp .env.example .env            # fill DATABASE_URL, PANEL_MASTER_KEY, ORIGIN, BETTER_AUTH_SECRET
npx tsx worker/cli.ts migrate
npm run dev                     # panel UI
npx tsx worker/main.ts          # worker, in another shell

npm run check                   # svelte-check
npm test                        # vitest (server unit tests; browser tests need playwright)
npm run build
```

## Security notes

- Secrets (site encryption keys, DB passwords, S3 credentials, gate passwords)
  are AES-256-GCM encrypted with `PANEL_MASTER_KEY`, which lives only in
  `/opt/emdash/env` — never in the database.
- Setup tokens are SHA-256 hashed at rest, single-use, and expire quickly.
- The setup-gate password is shown in the UI only while the site awaits owner
  setup; afterwards it is discarded.
- Caddy's admin API is bound to a unix socket shared only with the worker.
- Site containers run as `node` (uid 1000) with a read-only root filesystem,
  `no-new-privileges`, a PID cap, and bounded JSON logs. The panel mounts the
  Docker volumes dir for the file manager and chowns writes back to uid 1000.

See [docs/operations.md](docs/operations.md) for restore procedures, access-log
details, and operational notes.

## License

MIT — see [LICENSE](LICENSE).
