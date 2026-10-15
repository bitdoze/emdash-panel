<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Card from '#lib/components/Card.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';
	import UsageBar from '#lib/components/UsageBar.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		const t = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(t);
	});

	function fmtBytes(n?: number | null) {
		if (n === undefined || n === null) return '—';
		const units = ['B', 'KiB', 'MiB', 'GiB'];
		let i = 0;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}
	function fmtMs(n?: number) {
		return n === undefined ? '—' : n < 1000 ? `${n} ms` : `${(n / 1000).toFixed(2)} s`;
	}

	const cpuHist = $derived(data.usageHistory.map((h) => h.cpuPct));
	const memHist = $derived(data.usageHistory.map((h) => h.memBytes));
	const memLimitBytes = $derived(data.site.memoryMb * 1024 * 1024);
	const running = $derived(['ready', 'awaiting_setup'].includes(data.site.status));
</script>

<div class="space-y-6">
	<!-- Header -->
	<div class="flex flex-wrap items-start justify-between gap-3">
		<div>
			<div class="flex items-center gap-3">
				<h1 class="text-xl font-semibold tracking-tight">{data.site.name}</h1>
				<StatusPill status={data.site.status} />
			</div>
			<p class="mt-1 text-sm text-mute">
				{#each data.domains as d, i (d.id)}{#if i > 0}<span class="mx-1 text-zinc-700">·</span>{/if}<a
						href="https://{d.hostname}"
						target="_blank"
						rel="noopener"
						class="text-accent hover:underline">{d.hostname}</a
					>{/each}
			</p>
		</div>
		<div class="flex items-center gap-2">
			<a
				href="/sites/{data.site.id}/files"
				class="rounded-lg border border-line bg-panel px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600"
				>Files</a
			>
			<form method="POST" action="?/start" use:enhance class="inline">
				<button
					class="rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:border-zinc-600 disabled:opacity-40"
					disabled={data.site.status !== 'stopped'}>Start</button
				>
			</form>
			<form method="POST" action="?/stop" use:enhance class="inline">
				<button
					class="rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:border-zinc-600 disabled:opacity-40"
					disabled={!running}>Stop</button
				>
			</form>
			<form method="POST" action="?/backup" use:enhance class="inline">
				<button
					class="rounded-lg border border-line bg-panel px-3 py-2 text-sm hover:border-zinc-600 disabled:opacity-40"
					disabled={!['ready', 'awaiting_setup', 'stopped'].includes(data.site.status)}
					>Backup</button
				>
			</form>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
			{form.error}
		</div>
	{/if}
	{#if data.site.error}
		<div class="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
			{data.site.error}
		</div>
	{/if}
	{#if data.hasActiveJob}
		<div class="rounded-lg border border-accent/30 bg-accent/10 px-4 py-2.5 text-sm text-zinc-200">
			A job is running for this site — the page refreshes automatically.
		</div>
	{/if}

	{#if data.gateCredentials}
		<div class="rounded-xl border border-warn/40 bg-warn/10 p-4">
			<h2 class="text-sm font-semibold text-warn">CMS setup is protected</h2>
			<p class="mt-1 text-sm text-zinc-300">
				Visit
				<a
					href="https://{data.domains[0]?.hostname}/_emdash/admin/"
					target="_blank"
					rel="noopener"
					class="text-accent hover:underline">the admin setup</a
				>
				with the gate credential, finish EmDash owner setup, then click
				<strong>Setup complete</strong>.
			</p>
			<div class="mt-3 flex flex-wrap gap-3 font-mono text-sm">
				<span class="rounded-md bg-panel-2 px-2.5 py-1.5">user: <strong>{data.gateCredentials.username}</strong></span>
				<span class="rounded-md bg-panel-2 px-2.5 py-1.5">pass: <strong>{data.gateCredentials.password}</strong></span>
			</div>
			<form method="POST" action="?/completeSetup" class="mt-3" use:enhance>
				<button
					type="submit"
					class="rounded-lg bg-warn px-3 py-1.5 text-sm font-medium text-black hover:brightness-110"
					>Setup complete — remove gate</button
				>
			</form>
		</div>
	{/if}

	<!-- Usage charts -->
	<div class="grid gap-4 md:grid-cols-2">
		<Card title="CPU" subtitle="Container usage vs limit">
			<div class="flex items-baseline gap-2">
				<span class="text-2xl font-semibold"
					>{data.usage?.cpuPct != null ? `${data.usage.cpuPct.toFixed(1)}%` : '—'}</span
				>
				<span class="text-xs text-mute">of {data.site.cpuMillicores / 1000} vCPU cap</span>
			</div>
			<div class="mt-2">
				<UsageBar
					value={data.usage?.cpuPct ?? 0}
					max={data.site.cpuMillicores / 10}
					label=""
				/>
			</div>
			<div class="mt-3"><Sparkline values={cpuHist} suffix="%" height={52} /></div>
		</Card>
		<Card title="Memory" subtitle="Container usage vs limit">
			<div class="flex items-baseline gap-2">
				<span class="text-2xl font-semibold">{fmtBytes(data.usage?.memBytes)}</span>
				<span class="text-xs text-mute">of {data.site.memoryMb} MiB cap</span>
			</div>
			<div class="mt-2">
				<UsageBar value={data.usage?.memBytes ?? 0} max={memLimitBytes} label="" />
			</div>
			<div class="mt-3">
				<Sparkline
					values={memHist.map((v) => (v == null ? null : v / 1024 / 1024))}
					suffix=" MiB"
					stroke="#a78bfa"
					height={52}
					max={data.site.memoryMb}
				/>
			</div>
		</Card>
	</div>

	<div class="grid gap-4 lg:grid-cols-3">
		<!-- Left rail: details, domains, limits -->
		<div class="space-y-4 lg:col-span-1">
			<Card title="Details">
				<dl class="space-y-2 text-sm">
					<div class="flex justify-between"><dt class="text-mute">Database</dt><dd>{data.site.dbEngine}</dd></div>
					<div class="flex justify-between"><dt class="text-mute">Storage</dt><dd>{data.site.storageMode}</dd></div>
					<div class="flex justify-between gap-2">
						<dt class="text-mute">Image</dt>
						<dd class="truncate font-mono text-xs">{data.site.image ?? 'default'}</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-mute">Container</dt>
						<dd class="truncate font-mono text-xs">{data.site.containerName ?? '—'}</dd>
					</div>
					<div class="flex justify-between gap-2">
						<dt class="text-mute">Source</dt>
						<dd class="truncate font-mono text-xs">{data.site.sourceRepo ?? 'bundled template'}{data.site.sourceRef ? `#${data.site.sourceRef}` : ''}</dd>
					</div>
					<div class="flex justify-between">
						<dt class="text-mute">Created</dt>
						<dd>{new Date(data.site.createdAt).toLocaleDateString()}</dd>
					</div>
				</dl>
			</Card>

			<Card title="Resource limits" subtitle="Applied live to the running container">
				<form method="POST" action="?/updateLimits" use:enhance class="space-y-3">
					<label class="block text-xs text-mute">
						CPU (millicores · {data.limits.cpuMillicores.min}–{data.limits.cpuMillicores.max})
						<input
							name="cpuMillicores"
							type="number"
							min={data.limits.cpuMillicores.min}
							max={data.limits.cpuMillicores.max}
							step="50"
							value={data.site.cpuMillicores}
							class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-accent focus:outline-none"
						/>
					</label>
					<label class="block text-xs text-mute">
						Memory (MiB · {data.limits.memoryMb.min}–{data.limits.memoryMb.max})
						<input
							name="memoryMb"
							type="number"
							min={data.limits.memoryMb.min}
							max={data.limits.memoryMb.max}
							step="64"
							value={data.site.memoryMb}
							class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-sm text-zinc-100 focus:border-accent focus:outline-none"
						/>
					</label>
					<button
						type="submit"
						class="w-full rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
						disabled={!running}>Apply limits</button
					>
				</form>
			</Card>

			<Card title="Domains">
				<ul class="space-y-1.5 text-sm">
					{#each data.domains as d (d.id)}
						<li class="flex items-center justify-between">
							<span class="truncate text-zinc-300">{d.hostname}</span>
							<StatusPill status={d.state} />
						</li>
					{/each}
				</ul>
				<form method="POST" action="?/addDomain" class="mt-3 flex gap-2" use:enhance>
					<input
						name="hostname"
						placeholder="extra.emdashhq.com"
						class="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 text-xs focus:border-accent focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-md border border-line px-2.5 py-1.5 text-xs hover:bg-panel-2">Add</button
					>
				</form>
			</Card>
		</div>

		<!-- Main column -->
		<div class="space-y-4 lg:col-span-2">
			<!-- Traffic -->
			<Card title="Traffic" subtitle="Caddy access log summary">
				{#if !data.traffic}
					<p class="py-2 text-sm text-mute">No access log yet — traffic appears here once requests arrive.</p>
				{:else}
					<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
						<div><div class="text-xs text-mute">Requests 1h</div><div class="mt-0.5 text-lg font-semibold">{data.traffic.entries1h}</div></div>
						<div><div class="text-xs text-mute">Requests 24h</div><div class="mt-0.5 text-lg font-semibold">{data.traffic.entries24h}</div></div>
						<div><div class="text-xs text-mute">Bytes 24h</div><div class="mt-0.5 text-lg font-semibold">{fmtBytes(data.traffic.bytes24h)}</div></div>
						<div><div class="text-xs text-mute">5xx 24h</div><div class="mt-0.5 text-lg font-semibold {data.traffic.errors24h > 0 ? 'text-bad' : ''}">{data.traffic.errors24h}</div></div>
					</div>
					{#if data.traffic.topPaths.length > 0}
						<div class="mt-3 flex flex-wrap gap-1.5">
							{#each data.traffic.topPaths as p (p.path)}
								<span class="rounded-full bg-panel-2 px-2.5 py-1 font-mono text-xs text-zinc-400">{p.path} <span class="text-mute">×{p.count}</span></span>
							{/each}
						</div>
					{/if}
					{#if data.traffic.recent.length > 0}
						<div class="-mx-5 mt-3 max-h-56 overflow-auto border-t border-line">
							<table class="w-full font-mono text-xs">
								<tbody class="divide-y divide-line/50">
									{#each data.traffic.recent as e, i (i)}
										<tr class="hover:bg-panel-2/40">
											<td class="w-20 px-3 py-1.5 text-mute">{new Date(e.ts).toLocaleTimeString()}</td>
											<td class="w-14 px-2 py-1.5 {e.status >= 500 ? 'text-bad' : e.status >= 400 ? 'text-warn' : 'text-ok'}">{e.status}</td>
											<td class="w-16 px-2 py-1.5 text-zinc-400">{e.method}</td>
											<td class="max-w-0 truncate px-2 py-1.5 text-zinc-300">{e.uri}</td>
											<td class="w-24 px-3 py-1.5 text-right text-mute">{fmtBytes(e.size)} · {fmtMs(e.durationMs)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				{/if}
			</Card>

			<!-- Deployments -->
			<Card title="Deployments" subtitle="Rebuild from the bundled template or a git repository">
				<form method="POST" action="?/deploy" use:enhance class="flex flex-wrap items-center gap-2">
					<input
						name="gitUrl"
						placeholder="https://github.com/you/site.git (optional)"
						value={data.site.sourceRepo ?? ''}
						class="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-xs focus:border-accent focus:outline-none"
					/>
					<input
						name="gitRef"
						placeholder="ref"
						value={data.site.sourceRef ?? ''}
						class="w-28 rounded-md border border-line bg-panel-2 px-2.5 py-1.5 font-mono text-xs focus:border-accent focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-40"
						disabled={!running || data.hasActiveJob}>Deploy</button
					>
				</form>
				{#if data.deployments.length > 0}
					<div class="-mx-5 mt-3 divide-y divide-line/50 border-t border-line">
						{#each data.deployments as d (d.id)}
							<div class="flex items-center justify-between gap-3 px-5 py-2 text-xs">
								<div class="flex min-w-0 items-center gap-2">
									{#if d.isCurrent}<span class="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" title="current"></span>{/if}
									<span class="truncate font-mono text-zinc-300">{d.gitUrl ? `${d.gitUrl}${d.gitRef ? `#${d.gitRef}` : ''}` : (d.image ?? 'bundled')}</span>
								</div>
								<span class="flex shrink-0 items-center gap-3 text-mute">
									{new Date(d.createdAt).toLocaleDateString()}
									<StatusPill status={d.state} />
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</Card>

			<!-- Jobs + backups -->
			<div class="grid gap-4 md:grid-cols-2">
				<Card title="Jobs">
					{#if data.jobs.length === 0}
						<p class="text-sm text-mute">No jobs yet.</p>
					{:else}
						<div class="-mx-5 -my-4 divide-y divide-line/50">
							{#each data.jobs.slice(0, 8) as job (job.id)}
								<a
									href="/jobs/{job.id}"
									class="flex items-center justify-between px-5 py-2 text-sm hover:bg-panel-2/40"
								>
									<span class="font-mono text-xs">{job.type}</span>
									<span class="flex items-center gap-2">
										{#if job.progress}<span class="text-xs text-mute">{job.progress}</span>{/if}
										<StatusPill status={job.status} />
									</span>
								</a>
							{/each}
						</div>
					{/if}
				</Card>
				<Card title="Backups">
					{#if data.backups.length === 0}
						<p class="text-sm text-mute">No backups yet.</p>
					{:else}
						<div class="-mx-5 -my-4 divide-y divide-line/50">
							{#each data.backups as b (b.id)}
								<div class="flex items-center justify-between px-5 py-2 text-sm">
									<span class="text-xs text-zinc-300">{new Date(b.createdAt).toLocaleString()}</span>
									<span class="flex items-center gap-3">
										<span class="text-xs text-mute">{fmtBytes(b.sizeBytes)}</span>
										<StatusPill status={b.status} />
									</span>
								</div>
							{/each}
						</div>
					{/if}
				</Card>
			</div>

			<!-- Danger zone -->
			<div class="rounded-xl border border-bad/30 bg-bad/5 p-4">
				<div class="flex items-center justify-between">
					<div>
						<h3 class="text-sm font-semibold text-bad">Delete site</h3>
						<p class="mt-0.5 text-xs text-mute">Removes the container, routes and database.</p>
					</div>
					<form
						method="POST"
						action="?/delete"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Delete this site? Its container, routes and database will be removed.'))
								e.preventDefault();
						}}
					>
						<input type="hidden" name="purgeData" value="off" />
						<button
							type="submit"
							class="rounded-lg border border-bad/50 px-3 py-1.5 text-sm text-bad hover:bg-bad/10"
							onclick={(e) => {
								const input = (e.currentTarget as HTMLButtonElement).form!.querySelector(
									'input[name=purgeData]'
								) as HTMLInputElement;
								input.value = confirm('Also delete the data volume and stored secrets?')
									? 'on'
									: 'off';
							}}>Delete</button
						>
					</form>
				</div>
			</div>
		</div>
	</div>
</div>
