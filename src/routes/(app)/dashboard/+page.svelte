<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import Card from '#lib/components/Card.svelte';
	import MetricCard from '#lib/components/MetricCard.svelte';
	import UsageBar from '#lib/components/UsageBar.svelte';
	import Sparkline from '#lib/components/Sparkline.svelte';
	import * as Table from '#lib/components/ui/table/index.js';

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
				<Table.Root>
					<Table.Header>
						<Table.Row class="border-line hover:bg-transparent">
							<Table.Head>Site</Table.Head>
							<Table.Head>Status</Table.Head>
							<Table.Head>Engine</Table.Head>
							<Table.Head class="w-40">CPU</Table.Head>
							<Table.Head class="w-48">Memory</Table.Head>
							<Table.Head class="text-right">Net I/O</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each siteUsage as { site, c } (site.id)}
							<Table.Row class="border-line/60">
								<Table.Cell>
									<a href="/sites/{site.id}" class="font-medium text-zinc-100 hover:text-accent"
										>{site.name}</a
									>
								</Table.Cell>
								<Table.Cell><StatusPill status={site.status} /></Table.Cell>
								<Table.Cell class="text-mute">{site.dbEngine}</Table.Cell>
								<Table.Cell>
									<UsageBar
										value={c?.cpuPct ?? 0}
										max={site.cpuMillicores / 10}
										label="{c ? c.cpuPct?.toFixed(0) : '—'}%"
										detail="{site.cpuMillicores / 1000} vCPU"
									/>
								</Table.Cell>
								<Table.Cell>
									<UsageBar
										value={c?.memBytes ?? 0}
										max={site.memoryMb * 1024 * 1024}
										label={c ? fmtBytes(c.memBytes) : '—'}
										detail="{site.memoryMb} MiB"
									/>
								</Table.Cell>
								<Table.Cell class="text-right text-xs text-mute">
									{#if c}↓ {fmtBytes(c.rxBytes)} · ↑ {fmtBytes(c.txBytes)}{:else}—{/if}
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
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
					<Table.Root>
						<Table.Header>
							<Table.Row class="border-line hover:bg-transparent">
								<Table.Head>Container</Table.Head>
								<Table.Head>CPU</Table.Head>
								<Table.Head>Memory</Table.Head>
							</Table.Row>
						</Table.Header>
						<Table.Body>
							{#each containers as c (c.name)}
								<Table.Row class="border-line/60">
									<Table.Cell class="font-mono text-xs">{c.name}</Table.Cell>
									<Table.Cell>{c.cpuPct?.toFixed(1) ?? '—'}%</Table.Cell>
									<Table.Cell>{fmtBytes(c.memBytes)}</Table.Cell>
								</Table.Row>
							{/each}
						</Table.Body>
					</Table.Root>
				</div>
			{/if}
		</Card>
	</div>
</div>
