# EmDash VPS Deployment Panel — Revised Implementation Plan

Updated: 15 October 2026

Status: proposed architecture and acceptance criteria. This document replaces the supplied plan; it does not represent a tested implementation. Validate the integration points against the exact dependency versions selected before releasing an installer.

## 1. Product objective

I already have an emdashhq.com website the details should be in there.

Build an open-source panel that makes operating EmDash CMS sites on a Linux VPS straightforward: installation, domain setup, databases, storage, deployments, upgrades, backups, restoration, and basic monitoring.

The main advantage should be EmDash-aware operations. Git deployments and Railpack already exist in general hosting panels; they are supporting capabilities rather than a unique selling point.

Preserve the requested stack and capabilities:

- SvelteKit 3 with Svelte 5 and the Node adapter.
- Better Auth for panel authentication, including passkeys.
- Drizzle ORM and SQLite for panel state.
- Docker Engine, controlled through Dockerode.
- Caddy for public HTTPS and routing.
- SQLite or PostgreSQL for hosted EmDash sites.
- Optional S3-compatible storage, including Cloudflare R2, for media and backups.
- Railpack and BuildKit for Git-based builds.
- A single installation script, usable through a documented one-line command once a real release URL exists.
- An administrator dashboard with host and container resource monitoring.

## 2. Initial scope and trust model

The first supported deployment is one Linux VPS managed by one trusted administrator, hosting multiple sites owned by that administrator. Only trusted repositories and plugins are accepted.

Define and test a small supported Linux distribution/version matrix. Publish measured minimum hardware requirements after the reference deployment works. Do not promise compatibility with every Linux VPS, NAS, rootless Docker setup, or ARM machine without testing it.

Docker daemon access is an administrative capability on the host. Container isolation and the EmDash plugin sandbox do not turn this architecture into a safe platform for arbitrary customer code. Untrusted tenants require a separate isolation design and are outside the initial release.

Deferred scope: multiple servers, customer billing, public signup, reseller access, arbitrary Docker Compose applications, database browsing, unrestricted web terminals, and a generic Linux server manager.

## 3. Component boundaries

| Component | Responsibility | Sensitive access |
| --- | --- | --- |
| Web panel | UI, authentication, validation, authorized job submission, status and log display | Panel database and authentication secret; no Docker socket |
| Operations worker | Provisioning, deployments, backups, recovery, database provisioning, proxy reconciliation | Docker socket, required site secrets, protected Caddy admin socket |
| Build service | Run Railpack/BuildKit jobs with explicit inputs and resource limits | Build-scoped credentials; no production database or storage credentials |
| Caddy | Public HTTPS, panel route, site routes | Certificate state and private admin socket |
| EmDash runtime | Serve one site's application and CMS | That site's database, media storage, encryption key |
| Optional PostgreSQL | Host isolated databases and roles for sites choosing PostgreSQL | Administrative credential available only to operations worker |
| Metrics collector | Gather explicitly defined host/container measurements | Narrow read-only access where possible |

The web panel and worker can share a repository and release version while running as separate processes or containers. This prevents ordinary web request handling from directly executing long operations. It reduces exposed interfaces but does not remove the worker's host privileges.

### Networking requirements

- Publish only Caddy's required public ports: TCP 80 and 443; UDP 443 if HTTP/3 is enabled.
- Do not publish PostgreSQL, BuildKit, Caddy administration, or site runtime ports.
- Route the panel through its real HTTPS hostname. Any diagnostic HTTP access must be temporary and restricted, such as through an SSH tunnel.
- Give management networks explicit Docker names. Never rely on Compose's project-prefixed default while Dockerode uses a different literal name.
- Keep sites off the management network. Attach the proxy to the required site networks; give each site only its necessary connectivity.
- Keep Caddy administration on a permissioned Unix socket shared only with the operations worker. Do not expose an unauthenticated admin listener to site containers.
- Where sites share a PostgreSQL service, document the shared network boundary and enforce database permissions; a bridge network alone is not database isolation.
- Restrict any Docker or BuildKit control endpoints. A socket proxy that allows arbitrary container creation still exposes substantial host control.

## 4. Version and compatibility policy

Maintain a tested release manifest covering SvelteKit, Svelte, Better Auth and its plugins, Node, Astro, EmDash and its adapters, workerd, Railpack, BuildKit, Caddy, and PostgreSQL.

- Use lockfiles for packages and versioned image references, preferably recorded with digests.
- Do not deploy production components using mutable `latest` tags as the release contract.
- Use SvelteKit 3 conventions, including current `#lib` imports and environment configuration. Generate the starter with the supported CLI and verify the Node adapter configuration.
- Pin a supported Node runtime that satisfies both the panel and selected EmDash tooling; do not use an imprecise `Node 22+` requirement.
- Test workerd and native database dependencies on every advertised CPU architecture and runtime base image.
- Advertise ARM64 only after building and exercising that combination.
- Make dependency upgrades deliberate releases with compatibility and recovery checks.

## 5. Installation, onboarding, and upgrades

### Installer behavior

Distribute one `install.sh` entry point. The public one-line command must reference a real, documented release location; do not publish placeholder registry names or URLs as working installation instructions.

The installer must:

1. Check privileges, supported distribution, architecture, available memory, free disk/inodes, required ports, Docker Engine, and the Compose plugin.
2. Detect existing panels, reverse proxies, installation directories, and occupied ports. Explain conflicts without silently replacing services.
3. Install missing prerequisites through a supported path. Preserve existing Docker configuration. Do not overwrite `/etc/docker/daemon.json` or restart an existing Docker daemon merely to enable a build option.
4. Acquire an installation lock, create directories with deliberate ownership, and use restrictive permissions for secrets.
5. Download the selected release manifest, Compose configuration, initial Caddy configuration, and published images. A release install must not require a source checkout or `build: .`.
6. Generate persistent secrets only on first installation. Re-running installation must not rotate authentication secrets or PostgreSQL credentials.
7. Ask for or accept a real panel hostname. Validate DNS and explain required inbound connectivity before attempting public HTTPS.
8. Start components, run panel database migrations under a lock, and verify health.
9. Print a short-lived, single-use owner setup token and the actual panel URL. Never print database passwords or reusable administrator credentials.
10. Report success only after the panel and its HTTPS endpoint are ready. Otherwise report the failed stage and a recovery command.

Use `set -Eeuo pipefail`, careful quoting, explicit error handling, and an installation lock. Support noninteractive input without putting secrets into command-line arguments or logs.

### Repeatability and failure handling

- An interrupted installation can resume safely.
- A second run preserves sites, databases, volumes, credentials, certificates, and ownership.
- Partial work is recorded. Cleanup removes only resources owned by the failed operation.
- Existing PostgreSQL credentials are reconciled deliberately; changing an environment variable does not change a role password in an initialized database.
- First-run setup is protected by a server-generated token, not by a public race to register the first account.

### Separate lifecycle operations

Provide documented commands for status, repair, update, backup, restore, and uninstall. These may share a management CLI behind the installer.

- Updates use versioned artifacts, verify compatibility, and preserve persistent state.
- Panel database migrations have recovery instructions. An image downgrade is not automatically a safe database downgrade.
- Uninstall preserves site data by default and requires an explicit destructive option to remove it.
- Publish an inspect-before-running installation option and release integrity verification instructions.

## 6. Panel authentication and authorization

Use Better Auth with its Drizzle adapter and generated schema. Keep server-side authentication configuration in a server-only module.

Required implementation:

- Mount `svelteKitHandler` in the SvelteKit server hook.
- Retrieve and populate session state where authorization checks need it; the handler does not automatically populate all application locals.
- Use the supported Svelte client and cookie integration for the selected authentication flow.
- Install and configure `@better-auth/passkey` and its client plugin for passkeys.
- Define the canonical HTTPS base URL, trusted origins, secure cookie behavior, and passkey RP ID/origin.
- Keep the panel hostname stable. Document domain changes because passkeys are bound to relying-party identities.
- Disable unrestricted account registration after protected owner setup.
- Define administrator recovery, session revocation, and credential replacement.
- Rate-limit authentication and sensitive operations. Require recent authentication for destructive actions and secret changes.
- Authorize every server action, API endpoint, log stream, backup download, and site operation. UI visibility is not an authorization check.
- Preserve framework request-origin protections and validate all user-controlled domains, identifiers, paths, and repository inputs.
- Record an audit trail for deployments, restores, secret changes, and deletions without logging secrets.

Panel authentication and EmDash site authentication are separate systems. Panel access does not automatically create or authenticate a CMS user.

## 7. Durable operations and panel data model

Long operations run in the worker, not inside a webhook or form request. A durable queue backed by the panel SQLite database is sufficient for the initial single-server design; Redis is not a prerequisite.

### Suggested tables

- `sites`: stable ID, name, lifecycle state, runtime settings, database/storage selection.
- `domains`: hostname, site ownership, DNS/TLS state.
- `deployments`: exact commit, image digest, configuration revision, migration status, previous release.
- `jobs`: type, state, deduplication key, attempt count, lease owner/expiry, progress, failure reason.
- `backups`: manifest, destination, integrity status, retention and restore metadata.
- `storage_profiles`: endpoint, region, bucket, prefixes, encrypted credential references.
- `database_instances` and `site_databases`: engine, connection metadata, ownership.
- `secret_records`: encrypted secret material and rotation metadata.
- `audit_events` and `settings`.
- Better Auth's generated tables, maintained through its supported schema workflow.

### Execution requirements

- Persist a job before acknowledging a trigger; return its ID rather than waiting for a build.
- Allow only one conflicting mutation per site at a time.
- Use bounded build concurrency and explicit CPU, memory, disk, and timeout limits.
- Renew worker leases and recover expired jobs without duplicating completed side effects.
- Make Docker resources identifiable through labels containing installation, site, deployment, and operation IDs.
- Treat retries as normal: reconcile existing resources instead of blindly creating duplicates.
- Distinguish retryable errors from permanent configuration failures.
- Support cancellation at defined safe points and clean up incomplete build/runtime resources.
- Keep operation status available after a browser disconnect or worker restart.
- Stream bounded, redacted logs through authenticated SSE with reconnect support.
- Reconcile the database's desired state with actual Docker and Caddy state after restart. Do not recreate or delete resources based on names alone.

## 8. Explicit EmDash runtime contract

Provide and test a supported Astro/EmDash template. Railpack cannot infer all CMS operational requirements from a generic Node project.

Each template/release must define:

- Astro's production server output and Node standalone adapter.
- A real production start command, listening on `0.0.0.0` at the declared internal port.
- Database adapter selection and required dependencies.
- Local or S3-compatible media storage adapter configuration.
- Persistent database and media paths.
- EmDash encryption key generation, persistence, and recovery requirements.
- Supported migrations and CLI commands for the pinned release.
- Plugin sandbox runner configuration and runtime dependencies.
- Readiness and liveness probes with distinct meanings.
- Correct external origin/proxy settings for HTTPS and authentication.

Adopt a consistent runtime data mount, for example `/app/data`, and explicitly configure the selected adapter to use its database/media paths there. This is a project convention to implement, not an EmDash default to assume.

Do not assume that writing files into Astro's `public` directory after a build makes them available through the deployed server. Verify the media adapter and serving route in the production artifact.

For sandboxed plugins on Node, include both the supported runner and workerd, configure the runner, and exercise a plugin hook or route in the runtime check. Do not silently fall back to in-process execution when isolation is unavailable.

Validate environment variables against the actual template. Generic `DATABASE_URL` or `S3_*` injection only works when configuration deliberately consumes those values.

### Site provisioning sequence

1. Validate the request, reserve the domain, and persist the operation.
2. Generate site-specific credentials and a persistent encryption key.
3. Create labelled storage/network resources and provision the chosen database.
4. Build or pull a validated template artifact.
5. Establish a recovery point where existing data is involved; run supported migrations under the site lock.
6. Start the runtime and verify readiness, database access, media access, and required sandbox capability.
7. Reconcile Caddy's route and verify the external HTTPS endpoint.
8. Offer protected CMS owner setup. Prevent a public first-owner takeover through a supported bootstrap mechanism or temporary access restriction until the owner claims the site.
9. Mark the site ready and retain actionable errors for incomplete stages.

## 9. Databases

### SQLite

- Default option for straightforward single-server sites.
- Store data in a persistent site volume on a supported local filesystem.
- Define locking, busy timeout, and journal configuration through the supported adapter.
- Never assume that copying only a live `.db` file is a consistent backup.
- Limit deployment overlap according to migration and application compatibility; two containers sharing a volume is not a deployment policy.

### PostgreSQL

Support a managed shared PostgreSQL service and an external connection option. Make the managed service optional instead of forcing it on SQLite-only installations. Dedicated per-site PostgreSQL instances can follow later.

For the shared service:

- Create a distinct database and canonical role per site.
- Use cryptographically generated credentials; never use `Math.random()` for passwords.
- Give the site role the ongoing ownership/schema authority EmDash requires to create and change its tables. A database-level grant alone is insufficient.
- Revoke inappropriate public access and test cross-site access denial explicitly.
- Use stable generated identifiers rather than treating arbitrary user slugs as SQL identifiers.
- Handle SQL identifiers and utility-statement literals through a tested driver-supported approach. Do not assume every `CREATE ROLE` or `CREATE DATABASE` statement accepts ordinary bind parameters.
- Define partial-failure cleanup; database creation is not a single transactional operation covering all external resources.
- Set bounded connection pools and connection timeouts based on the shared service's capacity.
- Restrict the administrative credential to operations that need it. Site runtimes receive only their own role credentials.
- Verify TLS appropriately for external PostgreSQL connections.
- Implement password rotation as an explicit database and runtime update operation.

Database engine changes are explicit migrations with verification and recovery plans, not an instant settings toggle.

## 10. Caddy, domains, and HTTPS

Maintain one clear source of desired proxy configuration in the panel database, applied by the worker through Caddy's protected admin socket.

- Ship an initial configuration containing the panel route and required HTTP servers. Never assume that a server called `srv0` already exists.
- Assign stable route IDs and replace/update existing routes. Repeated POST appends must not create duplicates.
- Serialize configuration changes or use concurrency checks to avoid overwriting unrelated routes.
- Use Caddy's supported autosave/resume behavior, with persistent certificate/configuration storage. Reconcile desired routes after restart.
- Verify domain uniqueness and normalize hostnames safely. Document DNS, proxy/CDN, and certificate challenge prerequisites.
- Show separate states for DNS pending, route configured, certificate pending, and HTTPS ready.
- Do not promise certificates in milliseconds. Handle validation failures and certificate authority rate limits.
- Test HTTPS externally before enabling passkey onboarding.
- Domain removal and changes must clean up the correct routes without disturbing other sites.

## 11. Railpack builds and Git integration

Support two deployment inputs: a validated prebuilt image and a trusted Git repository built using Railpack. A tested Dockerfile path is a useful fallback for repositories outside Railpack's supported configuration.

### Git trigger requirements

- Authenticate manual deployment requests.
- Verify webhook signatures against the raw request body.
- Validate repository, branch, event type, and installation/site association.
- Deduplicate delivery IDs and retain the exact requested commit SHA.
- Build the specified commit rather than whatever happens to be the newest branch head when a worker starts.
- Support private repositories through scoped, encrypted credentials.
- Restrict repository URL schemes/hosts and prevent access to unintended local files or private endpoints through cloning inputs.

### Build execution requirements

- Check out each build in its own workspace; avoid a shared mutable checkout for concurrent requests.
- Use lockfile-aware package installation and recorded toolchain versions.
- Configure the BuildKit endpoint deliberately and include it in installation/health checks.
- Use the selected Railpack version's documented interface. Current CLI documentation uses `railpack build --name IMAGE DIRECTORY`; the original `--tag` and `--builder docker` examples must not be copied without verification.
- Define the image exporter/load or registry flow. A successful BuildKit build must result in an artifact the runtime Docker daemon can actually use.
- Tag and record artifacts by commit/deployment and retain their immutable digest.
- Separate build-time inputs from runtime secrets. Never forward the worker's entire `process.env` into build execution.
- Use short-lived build credentials and supported secret mounts where necessary; do not bake credentials into layers or logs.
- Stream output rather than retaining unbounded process buffers. Enforce timeouts and cancellation.
- Apply resource limits and a disk/cache retention policy so builds cannot exhaust a small VPS.
- Keep BuildKit privileges confined to its required component. The web panel does not need `privileged: true` to invoke a build service.

## 12. Deployment, migrations, and rollback

Use explicit deployment states: queued, preparing, building, migrating, starting, verifying, switching, draining, successful, failed, and cancelled.

Deployment sequence:

1. Acquire the site mutation lock and record the current artifact/configuration revision.
2. Resolve and build/pull the exact new artifact while the current site continues serving.
3. Inspect migration requirements and create the necessary restorable recovery point.
4. Apply the selected migration policy. Use a maintenance window when a change cannot safely coexist with the old version.
5. Start a uniquely named replacement container with the intended persistent volumes, settings, and resource limits.
6. Verify readiness with a deadline. A running process or open TCP port is not sufficient.
7. Update Caddy to the replacement container's explicit upstream identity, without depending on a later container rename.
8. Check the public endpoint, drain existing connections, then stop the old runtime.
9. Retain the previous artifact and configuration for the rollback retention window. Clean up later.

On failure before traffic switching, retain the serving version. After switching, restore the previous upstream when application/database compatibility permits. Record the actual serving release even if cleanup fails.

Zero-downtime deployment is conditional on schema compatibility, application behavior, storage semantics, and spare server capacity. It is not guaranteed by `stop()`/`start()` or container renaming. Image rollback and database restoration are different operations, with different data-loss implications.

## 13. Storage, backups, and restoration

### Separate media and backup storage

Provide local media and optional S3-compatible media profiles. Support configurable endpoint, region, bucket, key prefix, addressing behavior where required, and serving/public access settings appropriate to the chosen provider.

Media profiles and backup profiles must have separate purposes and scoped credentials. Verify each selected provider against the actual EmDash adapter. Do not assume identical endpoint, ACL, or URL behavior across S3, R2, and MinIO.

### Backup contents

- A consistent SQLite snapshot or PostgreSQL dump.
- Media files, or the documented versioned object-storage recovery point.
- Site encryption keys and required runtime configuration in an encrypted manifest/archive.
- Artifact digest, commit, EmDash version, and migration metadata.
- Panel database and the protected configuration needed to recover its encrypted secrets.
- Caddy configuration/certificate recovery information where necessary.

A schema seed is useful for reproducibility; it is not a substitute for backing up content, users, media, and secrets.

### Consistency and protection

- Use SQLite's backup API or another supported consistent snapshot method; handle WAL correctly.
- Use PostgreSQL's supported backup tooling with a tested client/server version combination.
- Coordinate database and media snapshots. Document whether a brief write pause or object versioning is needed to establish a coherent recovery point.
- Encrypt backups, verify integrity, and retain the required decryption key outside the server being backed up.
- Include encrypted secret recovery in the disaster-recovery design. Storing ciphertext without its recovery key is insufficient.
- Schedule backups, apply retention, and alert on failed or stale backups.
- Store an off-server copy. A second directory on the same VPS does not protect against server loss.

### Restore workflow

Verify manifest/integrity, choose a compatible runtime, restore into an isolated target, recreate required secrets and data, verify application/media access, then explicitly approve replacing a live site or changing its route.

Do not overwrite a live site's data during a restore preview. Report the restore point and expected loss of changes since that point.

The release gate includes restoration on a fresh server, not merely a successful backup upload.

## 14. Monitoring and operations UI

The dashboard should show sites, active jobs, recent failures, deployment history, backup freshness, and host capacity.

Basic metrics:

- Host CPU utilization measured over an interval; report load average separately.
- Host total/available memory, swap, relevant disk capacity, and inode availability.
- Per-container CPU, memory, restarts, OOM events, and network counters/rates where supported.
- Build resource usage and queue depth.
- Site readiness, external availability checks, certificate state, and backup freshness.

`fs.statfs` supplies filesystem statistics, not CPU or RAM. Measurements collected inside a container must be labelled and sourced correctly; do not present container limits as host capacity. Define the collector's host filesystem/process visibility explicitly.

Use one bounded collector instead of one Docker stats subscriber per browser. Store a small history with retention, then serve authenticated SSE updates. Cap log size, implement log rotation, and redact credentials and sensitive query strings.

Initial pages: owner setup/login, dashboard, site creation, site overview, domains, deployments/logs, storage, backups/restores, system settings, and audit history.

CLI actions should be an allowlist of supported EmDash operations, invoked with argument arrays. Include supported seed export, type generation, and WordPress import where the pinned release supports them. Do not expose arbitrary shell execution.

## 15. Secrets and container defaults

- Encrypt stored database, repository, object-storage, and site secrets using a documented authenticated-encryption scheme.
- Keep the master encryption key outside the panel database, with a deliberate backup and rotation procedure.
- Store only credential references in ordinary configuration views and redact secrets from logs and error messages.
- Use site-specific credentials and prevent accidental inheritance of panel/worker secrets.
- Set non-root runtime users where supported, drop unnecessary capabilities, and prevent privilege escalation.
- Keep runtime filesystems read-only where compatible, with explicit writable data/temp mounts.
- Set CPU, memory, process, restart, and log limits.
- Label resources and restrict destructive operations to the current installation/site ownership.
- Do not claim strong tenant isolation from these settings; revisit the trust model before accepting untrusted users or repositories.

## 16. Suggested repository layout

```text
src/
  hooks.server.ts
  lib/server/
    auth/              # Better Auth, owner setup, authorization
    db/                # Drizzle schema and migrations
    jobs/              # Persistent queue and operation state
    sites/             # Validation and EmDash runtime contract
    secrets/           # Encryption and credential references
    audit/
  routes/
    sites/
    settings/
    api/jobs/
    api/monitor/
    api/webhooks/
worker/
  main.ts
  docker/
  caddy/
  builds/
  databases/
  backups/
  reconcile/
templates/
  emdash-node/
deploy/
  compose.yaml
  caddy-bootstrap.json
scripts/
  install.sh
  manage.sh
tests/
  integration/
  recovery/
docs/
  installation.md
  operations.md
  disaster-recovery.md
  compatibility.md
```

Shared worker contracts may live in a package as the repository grows. The important boundary is execution and access control, not a particular monorepo tool.

## 17. Implementation phases and release gates

### Phase 0 — Integration proof

Build one reference EmDash site outside the dashboard. Prove the selected runtime, SQLite, PostgreSQL, local media, S3-compatible media, plugin sandbox, migrations, and supported CLI commands. Record actual paths and configuration.

Gate: the versioned artifact runs after container replacement and preserves content/media. Unsupported combinations are documented rather than hidden behind a generic success state.

### Phase 1 — Installable control plane

Implement the published-image installer, protected HTTPS onboarding, Better Auth, panel migrations, durable queue, operations worker, initial Caddy configuration, and basic reconciliation.

Gate: clean install, interrupted install, repeated install, panel restart, worker restart, and host reboot preserve credentials and known state.

### Phase 2 — Reliable site lifecycle

Implement site creation, SQLite and PostgreSQL choices, local/S3 media profiles, domains, logs, resource limits, consistent backups, and restore.

Gate: a site can be created, populated, restarted, backed up, and restored onto a clean server with working authentication and media.

### Phase 3 — Builds and safe deployments

Implement signed Git webhooks, exact-commit jobs, Railpack/BuildKit, private-repository credentials, readiness checks, explicit proxy switching, migration policy, and rollback.

Gate: bad builds and failed readiness checks preserve the live site; duplicate/concurrent triggers do not corrupt deployment state; interrupted jobs recover safely.

### Phase 4 — Operational polish

Add metrics history, alerts, panel updates, staging/clone workflows, documented database engine migrations, and contributor documentation.

Gate: upgrades and disaster recovery work from the published documentation, and every claimed capability has a reproducible acceptance check.

Treat the original six-week roadmap as a possible prototype target, not a production-readiness commitment. Estimate delivery after the integration proof and installer gates reveal the actual effort.

## 18. Required acceptance scenarios

- Installation with no source checkout, Dockerfile, or preinstalled build toolchain.
- Existing Docker configuration and unrelated services remain intact.
- Occupied ports, invalid DNS, unreachable certificate challenges, and insufficient disk produce useful failures.
- Second installation does not regenerate secrets or reset ownership.
- Panel and site admin setup cannot be claimed by an unauthenticated stranger.
- Unauthorized users cannot read logs, download backups, create jobs, or mutate sites.
- Sites cannot reach the Caddy administration endpoint or inherit host-control credentials.
- One PostgreSQL site's role cannot access another site's database.
- Both database modes and supported media modes preserve data across runtime replacement.
- Sandbox failure is detected and never silently changes the plugin trust boundary.
- Webhook tampering, duplicate deliveries, and branch mismatches are handled safely.
- A build uses the requested commit and does not receive production secrets.
- Failed build, migration, readiness, proxy update, and cleanup stages report the correct serving state.
- Restarting the worker during each operation does not duplicate or destroy resources.
- A full server reboot preserves proxy routes and persistent data.
- Backup integrity and fresh-server restoration are verified, including encryption keys and media.
- Rollback with an incompatible schema is blocked or routed through the documented recovery procedure.
- Build concurrency and disk cleanup prevent routine deployment work from exhausting the host.

These are the high-value integration and recovery checks. Avoid a large test suite that merely mirrors helper implementations while leaving these journeys untested.

## 19. Corrections to the supplied plan

| Original assumption/example | Revised requirement |
| --- | --- |
| Generic panels struggle with Git builds | Position around EmDash lifecycle knowledge; existing panels already support Git/Railpack |
| Installer builds an absent local project | Pull published, versioned release images |
| Overwrite Docker daemon configuration | Preserve configuration and change prerequisites deliberately |
| Generate new secrets on every installer run | Generate once; make rotation an explicit operation |
| `panel.local`, HTTP IP onboarding, HTTPS auth URL | Define and verify one real HTTPS panel origin |
| Caddy API reachable at `caddy:2019` by default | Explicit protected admin socket and bootstrap configuration |
| Assume `srv0` and append routes repeatedly | Create known servers and reconcile stable route IDs |
| Compose network name equals Dockerode literal | Explicit network names and tested attachment |
| Better Auth config alone protects the panel | Handler, schema, sessions, authorization, owner setup, recovery |
| `better-auth/plugins/passkey` | Supported `@better-auth/passkey` package for the pinned version |
| `Math.random()` database passwords | Cryptographic credentials and tested role provisioning |
| `GRANT ALL ... ON DATABASE` is sufficient | Correct per-site ownership/schema authority and isolation checks |
| Railpack `--tag` / `--builder docker` | Verify current CLI; define BuildKit and image export/load |
| Web request performs entire deployment | Durable background job with leases, locks, retries, recovery |
| Stop/start or rename means zero downtime | Readiness-gated explicit upstream switching and migration policy |
| Copy a live SQLite file as the backup | Supported consistent snapshot plus restoration verification |
| Environment variables configure every Astro project | Explicit supported EmDash template/runtime contract |
| `fs.statfs` measures CPU/RAM/disk | Separate, correctly scoped metric sources |
| Privileged web panel is required for builds | Separate web, operations, and build access boundaries |
| Final plan can omit earlier S3/backup requirements | Implement media and backup storage as explicit independent features |

## 20. Primary references

Checked during the review on 15 October 2026. Pin versions and recheck the relevant documentation when implementing or upgrading.

- [SvelteKit 3 release context and conventions](https://svelte.dev/blog/whats-new-in-svelte-october-2026)
- [Better Auth: SvelteKit integration](https://better-auth.com/docs/integrations/svelte-kit)
- [Better Auth: passkeys](https://better-auth.com/docs/plugins/passkey)
- [EmDash: Node.js deployment](https://docs.emdashcms.com/deployment/nodejs/)
- [EmDash: database adapters and PostgreSQL role requirements](https://docs.emdashcms.com/deployment/database/)
- [EmDash: plugin sandbox configuration](https://docs.emdashcms.com/deployment/plugin-sandbox/)
- [EmDash releases and upgrade tooling](https://github.com/emdash-cms/emdash/releases)
- [Caddy administration API and configuration persistence](https://caddyserver.com/docs/api)
- [Caddy command-line resume behavior](https://caddyserver.com/docs/command-line)
- [Railpack CLI reference](https://railpack.com/reference/cli)
- [Docker Engine security and daemon access](https://docs.docker.com/engine/security/)
- [SQLite online backup methods](https://sqlite.org/backup.html)
- [Coolify build strategies, including Railpack](https://coolify.io/docs/applications/builds/overview)

