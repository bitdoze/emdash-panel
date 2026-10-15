<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Card from '#lib/components/Card.svelte';
	import MetricCard from '#lib/components/MetricCard.svelte';
	import UsageBar from '#lib/components/UsageBar.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		const t = setInterval(() => invalidateAll(), 5000);
		return () => clearInterval(t);
	});

	function fmtBytes(n?: number) {
		if (n === undefined || n === null) return '—';
		const units = ['B', 'KiB', 'MiB', 'GiB'];
		let i = 0;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}

	const host = $derived(data.metrics?.host);
	const containers = $derived(data.metrics?.containers ?? []);

	const cpuHist = $derived(data.history.map((h) => h.host?.cpuPct));
	const memHist = $derived(
		data.history.map((h) =>
			h.host?.memTotal ? ((h.host.memTotal - (h.host.memAvailable ?? 0)) / h.host.memTotal) * 100 : null
		)
	);
	const diskHist = $derived(
		data.history.map((h) => (h.host?.diskTotal ? 100 - ((h.host.diskFree ?? 0) / h.host.diskTotal) * 100 : null))
	);
	const netHist = $derived(
		data.history.map((h) => (h.containers ?? []).reduce((a, c) => a + (c.rxBytes ?? 0) + (c.txBytes ?? 0), 0))
	);

	const siteUsage = $derived(
		data.sites
			.filter((s) => s.status !== 'deleted')
			.map((s) => {
				const c = containers.find((x) => x.name === s.containerName);
				return { site: s, c };
			})
	);

	let age = $derived(data.metricsAt ? Math.max(0, Math.round((Date.now() - data.metricsAt) / 1000)) : null);
</script>

<div class="space-y-6">
	<div class="flex items-end justify-between">
		<div>
			<h1 class="text-xl font-semibold tracking-tight">Dashboard</h1>
			<p class="mt-0.5 text-sm text-mute">
				Host + managed container overview{#if age !== null}
					· metrics {age}s ago{/if}
			</p>
		</div>
		<a
			href="/sites/new"
			class="rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 transition hover:brightness-110"
			>New site</a
		>
	</div>

	<!-- Host vitals -->
	<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
		<MetricCard
			label="Host CPU"
			value={host?.cpuPct !== undefined ? `${host.cpuPct.toFixed(0)}%` : '—'}
			sub="all cores"
			history={cpuHist}
			suffix="%"
		/>
		<MetricCard
			label="Memory"
			value={host?.memTotal
				? `${Math.round(((host.memTotal - (host.memAvailable ?? 0)) / host.memTotal) * 100)}%`
				: '—'}
			sub="{fmtBytes(host?.memTotal ? host.memTotal - (host.memAvailable ?? 0) : undefined)} of {fmtBytes(host?.memTotal)}"
			history={memHist}
			suffix="%"
			accent="#a78bfa"
		/>
		<MetricCard
			label="Load"
			value={host?.load1 !== undefined ? `${host.load1.toFixed(2)}` : '—'}
			sub="1m · {host?.load5?.toFixed(2)} · {host?.load15?.toFixed(2)}"
			history={data.history.map((h) => h.host?.load1)}
			accent="#34d399"
		/>
		<MetricCard
			label="Disk"
			value={fmtBytes(host?.diskFree)}
			sub="free of {fmtBytes(host?.diskTotal)}"
			history={diskHist}
			suffix="%"
			accent="#fbbf24"
		/>
	</div>

	<!-- Network throughput -->
	<Card title="Network" subtitle="Combined site container traffic (cumulative rx+tx)">
		<div class="flex items-end justify-between">
			<div class="text-sm text-zinc-300">
				{fmtBytes(netHist[netHist.length - 1] ?? 0)}
				<span class="text-mute">transferred</span>
			</div>
		</div>
		{#if netHist.length > 1}
			<div class="mt-2">
				<Sparkline values={netHist} stroke="#4f8ff7" height={56} />
			</div>
		{:else}
			<p class="py-3 text-sm text-mute">Collecting samples…</p>
		{/if}
	</Card>

	<!-- Site usage table -->
	<Card title="Sites" subtitle="Live container usage per site">
		{#if siteUsage.length === 0}
			<p class="py-4 text-center text-sm text-mute">No sites yet. Create your first EmDash site.</p>
		{:else}
			<div class="-mx-5 -my-4 overflow-x-auto">
				<table class="w-full text-sm">
					<thead class="border-b border-line text-left text-xs text-mute">
						<tr>
							<th class="px-5 py-2.5 font-medium">Site</th>
							<th class="px-4 py-2.5 font-medium">Status</th>
							<th class="px-4 py-2.5 font-medium">Engine</th>
							<th class="w-40 px-4 py-2.5 font-medium">CPU</th>
							<th class="w-48 px-4 py-2.5 font-medium">Memory</th>
							<th class="px-4 py-2.5 text-right font-medium">Net I/O</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-line/60">
						{#each siteUsage as { site, c } (site.id)}
							<tr class="hover:bg-panel-2/50">
								<td class="px-5 py-3">
									<a href="/sites/{site.id}" class="font-medium text-zinc-100 hover:text-accent"
										>{site.name}</a
									>
								</td>
								<td class="px-4 py-3"><StatusPill status={site.status} /></td>
								<td class="px-4 py-3 text-mute">{site.dbEngine}</td>
								<td class="px-4 py-3">
									<UsageBar
										value={c?.cpuPct ?? 0}
										max={site.cpuMillicores / 10}
										label="{c ? c.cpuPct?.toFixed(0) : '—'}%"
										detail="{site.cpuMillicores / 1000} vCPU"
									/>
								</td>
								<td class="px-4 py-3">
									<UsageBar
										value={c?.memBytes ?? 0}
										max={site.memoryMb * 1024 * 1024}
										label={c ? fmtBytes(c.memBytes) : '—'}
										detail="{site.memoryMb} MiB"
									/>
								</td>
								<td class="px-4 py-3 text-right text-xs text-mute">
									{#if c}↓ {fmtBytes(c.rxBytes)} · ↑ {fmtBytes(c.txBytes)}{:else}—{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</Card>

	<div class="grid gap-6 lg:grid-cols-2">
		<Card title="Recent jobs">
			{#if data.jobs.length === 0}
				<p class="py-4 text-center text-sm text-mute">No jobs yet.</p>
			{:else}
				<div class="-mx-5 -my-4 divide-y divide-line/60">
					{#each data.jobs as job (job.id)}
						<a
							href="/jobs/{job.id}"
							class="flex items-center justify-between px-5 py-2.5 text-sm hover:bg-panel-2/50"
						>
							<span class="font-mono text-xs text-zinc-300">{job.type}</span>
							<span class="flex items-center gap-3">
								{#if job.progress}<span class="text-xs text-mute">{job.progress}</span>{/if}
								<StatusPill status={job.status} />
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</Card>

		<Card title="All containers" subtitle="Every managed container on the host">
			{#if containers.length === 0}
				<p class="py-4 text-center text-sm text-mute">No containers reporting.</p>
			{:else}
				<div class="-mx-5 -my-4 overflow-x-auto">
					<table class="w-full text-sm">
						<thead class="border-b border-line text-left text-xs text-mute">
							<tr>
								<th class="px-5 py-2.5 font-medium">Container</th>
								<th class="px-4 py-2.5 font-medium">CPU</th>
								<th class="px-4 py-2.5 font-medium">Memory</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line/60">
							{#each containers as c (c.name)}
								<tr class="hover:bg-panel-2/50">
									<td class="px-5 py-2.5 font-mono text-xs">{c.name}</td>
									<td class="px-4 py-2.5">{c.cpuPct?.toFixed(1) ?? '—'}%</td>
									<td class="px-4 py-2.5">{fmtBytes(c.memBytes)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Card>
	</div>
</div>
