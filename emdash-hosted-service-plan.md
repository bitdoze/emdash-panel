# EmDash Hosted Service — Separate Product and Architecture Plan

Updated: 15 October 2026

Status: proposed extension to the [self-hosted panel plan](./emdash_panel_plan.md). This document describes a customer-facing service; it does not change the self-hosted product's initial single-administrator scope. The architecture and release gates require implementation and validation.

## 1. Product objective

Offer a service where customers log in, create projects, deploy EmDash websites, connect domains, and manage releases, storage, backups, and account settings.

Typical customer journey:

1. Create an account and organization.
2. Create a project and select a tested EmDash template.
3. Select a service plan and configure billing when required.
4. Deploy a site and receive a platform-provided HTTPS hostname.
5. Complete protected EmDash owner setup.
6. Connect a custom domain.
7. Manage deployments, backups, usage, and collaborators.

The service should sell reliable EmDash operations: working deployments, safe upgrades, recovery, and clear support. It is a broader operational commitment than publishing a web interface for Docker.

## 2. Two service models

| Model | Infrastructure ownership | Service responsibility | Customer responsibility |
| --- | --- | --- | --- |
| Managed hosting | You operate workload servers | Provisioning, isolation, capacity, networking, backups, updates, availability, support | Site content, users, domain configuration, permitted customizations |
| Bring your own VPS | Customer operates a supported server | Hosted control plane, secure agent protocol, deployment workflows, status | Server account, infrastructure bills, required access, host maintenance as defined in the support agreement |

Recommended initial product decision: launch managed hosting using controlled templates. Add bring-your-own-VPS as a separate execution backend after the deployment contracts stabilize. Do not attempt both operating models in the first release.

If customer-owned servers are the intended first market, reverse that order explicitly and narrow the supported host configuration. Either choice reuses the same operations engine, but onboarding, support, and cost ownership differ.

## 3. Relationship to the self-hosted panel

Share tested libraries and contracts for:

- EmDash template/runtime configuration.
- Database and storage provisioning.
- Build, migration, deployment, rollback, backup, and restore operations.
- Job state, idempotency, progress events, and structured errors.
- Runtime health checks and resource ownership labels.

Provide separate product interfaces:

- Self-hosted administrator panel: one trusted owner managing their server.
- Hosted customer dashboard: organization-scoped operations and usage.
- Internal operations console: fleet health, support access, capacity, incident handling.

Reuse the engine without forcing both products into an identical database or deployment topology. Define tenant/site/operation identity in shared contracts early, even when a self-hosted installation has only one owner.

## 4. Control plane and workload separation

### Hosted control plane

- SvelteKit 3 and Svelte 5 customer dashboard and server endpoints.
- Better Auth for identities, sessions, and selected authentication methods.
- Explicit application authorization for organizations, projects, and resources.
- Drizzle with PostgreSQL for shared hosted metadata and durable job state.
- API/webhook receivers that validate input and enqueue operations.
- Billing integration, entitlement calculation, usage records, and audit events.
- A scheduler that selects eligible workload capacity.

PostgreSQL is a proposed hosted metadata choice, not a requirement to replace SQLite in the self-hosted panel. Use leases and concurrency controls suitable for multiple workers.

### Workload infrastructure

- Customer sites run on infrastructure separate from the public control plane.
- Agents execute approved operations on their assigned workload environments.
- Builds run in isolated, disposable environments and publish immutable images.
- Runtime environments receive only the credentials needed by their assigned sites.
- Media and backups use storage independent of individual workload machines.
- Public ingress routes requests to healthy site runtimes.

The customer-facing web process must not hold a fleet-wide Docker socket or direct access to every workload host. Restrict privileged execution to the operations layer and make its authority explicit.

## 5. Accounts, organizations, and authorization

Use an organization as the billing and ownership boundary. One person can belong to multiple organizations; one organization can own multiple projects and sites.

Initial roles:

| Role | Capabilities |
| --- | --- |
| Owner | Ownership transfer, members, billing, projects, destructive organization actions |
| Administrator | Manage sites, settings, deployments, storage, and recovery within the organization |
| Developer | Deploy and inspect permitted projects; no billing or ownership changes |
| Viewer | Read permitted status and logs, excluding secrets and sensitive exports |

The first beta can expose fewer roles while retaining an explicit permission model. Define backup download, secret viewing, restore, domain changes, deletion, and member invitations as separate permissions.

Every database query, job submission, background operation, object-storage access, and log stream must enforce ownership. Derive the authorized organization from the session and membership; do not trust a tenant ID provided by the browser.

Also define:

- Invitation expiry and acceptance rules.
- Session revocation and account recovery.
- Ownership transfer and protection against deleting the last owner accidentally.
- Short-lived, scoped service tokens if an API is offered.
- Audited, time-limited support access with a recorded reason and an appropriate customer authorization process.

Customer dashboard identity remains separate from identities inside each hosted EmDash CMS. Use a supported, explicit handoff if adding CMS sign-in convenience later; do not distribute reusable CMS administrator credentials through dashboard links.

## 6. Isolation and accepted customer code

The self-hosted plan assumes trusted code. A public service must assume a customer account, site, theme, plugin, or repository can behave maliciously.

### Initial release policy

- Deploy only platform-tested, versioned templates.
- Define and enforce which theme/plugin modifications are allowed.
- Do not allow arbitrary native plugins, shell commands, Dockerfiles, or Git repositories through indirect configuration paths.
- Validate whether each permitted EmDash customization executes code, accesses files/network, or changes the effective trust boundary.
- Keep privileged host APIs and infrastructure credentials outside customer runtime reach.

### Runtime isolation

Use a deliberate VM or microVM isolation boundary for customer code. A conservative starting policy is one organization per VM, with its sites in containers inside that VM. Record the cost and density tradeoff rather than presenting ordinary containers as equivalent isolation.

If shared VMs are considered for tightly controlled templates, make that a separate, documented security decision with a narrower customization model. Do not silently introduce arbitrary code into that shared environment later.

### Build isolation

- Use a disposable environment for each customer build, with no access to the runtime host or control-plane sockets.
- Issue only scoped repository/registry credentials and revoke them after the job.
- Never expose production database or storage secrets during builds.
- Restrict outbound access to metadata services, management networks, and private infrastructure; define exceptions deliberately.
- Apply resource limits, timeouts, cleanup, and cache isolation.

EmDash's plugin sandbox is an additional application boundary. It does not replace infrastructure isolation or protect the service from every native plugin or build script.

## 7. Agents and job execution

Use an agent protocol instead of exposing host management APIs publicly.

- Agents establish authenticated outbound connections where practical.
- Enrollment uses a short-lived, single-use token scoped to the intended server/environment.
- Exchange enrollment for a revocable machine identity; use mutually authenticated TLS or an equivalent authenticated transport.
- Authorize jobs against agent identity, assigned environment, tenant, and operation type.
- Include operation ID, site ID, configuration revision, expiry, and replay/deduplication information.
- Validate signed instructions or equivalent transport/application authenticity. Signing alone does not establish the agent's authorization scope.
- Deliver secrets only when needed through a scoped mechanism; exclude them from progress events.
- Maintain heartbeats, leases, version compatibility, reconnect handling, and credential rotation.
- Reconcile actual resources after disconnects before retrying mutations.

For bring-your-own-VPS, document precisely which host privileges the agent needs. Uninstall and service cancellation must explain how the customer retains their running sites, data, and required credentials.

## 8. Fleet scheduling and deployment

Track workload servers by region, supported architecture, available resources, health, capacity reservations, maintenance state, and tenant placement restrictions.

The scheduler must:

- Reserve capacity before provisioning, so concurrent requests cannot promise the same resources twice.
- Apply per-organization quotas and per-site runtime limits.
- Keep build capacity separate from capacity promised to serving sites.
- Respect the chosen tenant isolation policy.
- Reject or queue work when capacity is insufficient and communicate that state clearly.

Reuse the self-hosted deployment state machine: exact artifact, migration policy, readiness, explicit traffic switch, draining, and rollback compatibility checks.

For the beta, advertise a single-region, single-runtime-per-site service if that is what is implemented. A restart policy, spare server, or persistent volume does not by itself provide automatic failover or high availability.

Node evacuation, cross-server restoration, and automatic rescheduling need procedures that account for database/media placement and fencing. Do not start duplicate writers after a network partition.

## 9. Domains and customer onboarding

- Assign an unguessable, unique platform hostname with verified HTTPS.
- Reserve custom domains globally and require ownership verification before routing them to a customer.
- Show the exact DNS record and separate verification, routing, and certificate states.
- Prevent a deleted site's stale domain record from being claimed by another customer without fresh verification.
- Protect initial CMS owner setup against takeover. A random hostname alone is insufficient protection.
- Define safe preview/staging hostnames and access controls.
- Handle custom-domain removal, certificate renewal failures, and account cancellation explicitly.

Panel passkeys use the control-plane relying-party domain. Each EmDash site's authentication has its own domain implications; connecting or changing custom domains must follow a tested CMS procedure.

## 10. Plans, quotas, usage, and payments

Define entitlements before integrating a payment provider. Start with a small number of understandable plans; choose prices after measuring actual service costs.

Possible limits:

- Number of sites, members, custom domains, and staging environments.
- Reserved/runtime CPU and memory.
- Media capacity and storage request/transfer policy.
- Backup retention and recovery options.
- Build minutes, concurrency, and deployment frequency.
- Support coverage and region availability.

Specify whether each limit is enforced, billed as overage, or a fair-use boundary. Enforce it in the API, job worker, scheduler, and runtime, not only in the dashboard.

Payment handling must include:

- Verified, deduplicated payment webhooks.
- Entitlements computed from recorded provider state rather than a browser success redirect.
- Reconciliation after delayed or reordered events.
- Trial eligibility, failed payment notices, grace periods, and controlled suspension.
- Safe upgrades/downgrades when current usage exceeds the requested plan.
- Explicit cancellation and data-retention states; no immediate deletion on a transient billing failure.
- Handling of refunds, disputes, and account restoration according to the published policy.

Usage records must be durable and idempotent where they affect charges. Show customers the measurement period, included allowance, measured use, and any delay in reporting. Validate invoices and tax handling for the markets served before launch.

## 11. Databases, media, backups, and recovery

Select a database and storage topology consistent with tenant isolation. A database per site and per-site role are useful boundaries, but a shared database service remains shared infrastructure that must be operated and secured.

- Keep control-plane metadata separate from customer content databases.
- Give every site only its own database and object-storage authority.
- Avoid broad bucket credentials in customer runtimes; use scoped credentials, policy-enforced prefixes, or separate buckets as appropriate.
- Do not treat object key prefixes alone as an access-control mechanism.
- Support consistent database backups, coherent media recovery points, and recovery of site encryption keys.
- Keep encrypted backups outside the workload host and define retention and deletion policies.
- Verify restoration into a clean isolated environment before replacing a live site.
- Separate authorized backup export from ordinary viewer/log permissions.

Set measurable recovery objectives after testing. Publish how much data can be lost and how long restoration is expected to take for the offered service tier; do not promise targets the system has not demonstrated.

The control plane needs its own database backups, secret-key recovery, and incident runbook. Document how sites continue serving during a control-plane outage, while new deployments and management actions may be unavailable.

## 12. Customer and internal interfaces

### Customer dashboard

Organizations and invitations, projects/sites, create/deploy flow, domains, deployments/logs, backup/restore/export, resource usage, plans/billing, account security, and support requests.

Expose meaningful application states such as building, awaiting DNS, ready, payment grace period, and restore in progress. Keep internal Docker identifiers and infrastructure credentials out of routine customer flows.

### Internal operations console

Fleet capacity, agent health/version, failed jobs, incident status, customer/site lookup, provisioning repair, deployment history, backup failures, controlled support access, and billing reconciliation.

Require strong staff authentication and narrowly assigned operational roles. Customer impersonation must not be an unaudited convenience button.

## 13. Abuse prevention and service lifecycle

Before public signup, implement:

- Signup and provisioning rate limits; define whether trials require payment verification.
- Build, runtime, network, and storage limits that prevent runaway resource consumption.
- Controls against unintended access to internal services and cloud metadata.
- A documented response to malicious content, phishing, spam, and compromised sites.
- Notification and review paths for suspension, avoiding unrecorded destructive actions.
- Customer export and deletion workflows covering databases, media, secrets, backups, and retention periods.
- A dependency/security update process and a method to contact affected customers.

Publish the service terms, privacy information, support boundaries, acceptable-use policy, retention rules, and region/data-location information before launch. Obtain appropriate review for the jurisdictions and customer types served; this document does not establish legal compliance.

## 14. Hosted data model additions

Add entities for organizations, memberships, invitations, projects, tenant-scoped sites, plans, subscriptions, entitlements, usage events, billing events, servers, agent identities, capacity reservations, placement assignments, support-access grants, and retention/deletion tasks.

Every customer-owned entity needs an explicit ownership relationship. Composite constraints and tenant-scoped queries should prevent cross-organization references. Database row-level security can provide another boundary where suitable, but it does not replace correct authorization in workers and external services.

Keep immutable records of artifact identity, configuration revision, job trigger, initiating actor, tenant, placement, and migration result. These records support incident investigation, billing disputes, and recovery.

## 15. Rollout phases

### Phase A — Operate the engine yourself

Deploy several sites using the self-hosted operations engine. Prove installer repeatability, migrations, replacement deployments, off-server backups, and fresh-server restoration. Measure actual resource costs.

### Phase B — Private managed-hosting beta

Invite a small number of customers. Offer one region, controlled templates, explicit tenant isolation, platform/custom domains, quotas, backups, basic billing, and direct support. Provisioning may have an operator approval step while the workflow is being validated; make the expected wait clear.

Gate: organization isolation, protected CMS setup, verified domains, failed provisioning recovery, cancellation/retention, and full restoration all work.

### Phase C — Reliable self-service

Automate capacity reservation and placement, billing reconciliation, resource enforcement, alerts, worker recovery, upgrades, and support operations. Add teams only with tested permissions.

Gate: customers can complete the entire supported journey without routine operator intervention, and service outages have documented recovery paths.

### Phase D — Advanced deployment options

Add isolated Git/Railpack builds, private repositories, staging, preview deployments, and broader customization after their isolation model is validated. Add bring-your-own-VPS if there is demonstrated demand and a supported agent lifecycle.

Defer multi-region routing and availability guarantees until database placement, migration, failover, and recovery are implemented and measured.

## 16. Acceptance scenarios

- Customer A cannot read, deploy, restore, export, or delete customer B's resources, including through direct API requests, SSE, queued jobs, or object-storage links.
- Invitations, role changes, ownership transfer, and revoked sessions take effect as documented.
- Domain ownership cannot be stolen through stale mappings or a race during site creation.
- Initial CMS setup cannot be claimed by an unrelated visitor.
- Agent identities cannot execute jobs for an unassigned tenant or environment; revoked identities stop receiving work.
- Customer workloads and build jobs cannot access Docker/BuildKit management, fleet credentials, other tenants' secrets, or internal metadata endpoints.
- Duplicate signup, deployment, payment, and webhook events do not create duplicate billable resources.
- Two concurrent provisioning requests cannot over-reserve a server.
- Plan limits are enforced outside the UI, and a noisy site/build cannot bypass its assigned limits.
- Payment failures, cancellation, and suspension preserve data for the promised period and allow supported recovery/export.
- Host failure, worker restart, control-plane outage, and a failed migration have reproducible operating procedures.
- A customer's backup restores onto a fresh environment with working media, authentication, and site secrets.
- Logs, metrics, support access, exports, and billing records preserve the correct tenant scope.
- Customer sites keep serving during a tested control-plane restart where the declared service topology permits it.

## 17. Commercial validation and launch decisions

Before committing to a public launch, decide and record:

- First customer segment: individual site owners, agencies, or development teams.
- First service model: managed hosting or customer-owned servers.
- Permitted customization and its isolation boundary.
- Supported region, recovery objectives, support hours, and availability claims.
- Included resources, overage policy, expected operating cost, and target margin.
- Whether migration assistance, custom domains, backups, and staging are included in the initial offer.
- Customer exit path: export, self-host migration, and retention/deletion behavior.

Measure cost per active and idle site, build cost, bandwidth, backup growth, and support effort during the private beta. Pricing should account for recovery and operations, not only the cost of the Docker container.

## 18. References and implementation status

Reuse the verified integration references in the [self-hosted panel plan](./emdash_panel_plan.md#20-primary-references), particularly Better Auth, EmDash deployment/database/sandbox guidance, Railpack, Caddy, Docker security, and SQLite backup methods.

All topology choices, permissions, quotas, placement behavior, recovery objectives, and billing rules here are requirements or proposals for this product. They are not capabilities supplied automatically by SvelteKit, Better Auth, Docker, or EmDash, and must be tested before being advertised.

