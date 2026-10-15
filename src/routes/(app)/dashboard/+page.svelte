<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';

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

	const host = $derived((data.metrics as { host?: Record<string, number> } | null)?.host);
	const containers = $derived(
		((data.metrics as { containers?: { name?: string; cpuPct?: number; memBytes?: number }[] } | null)
			?.containers ?? [])
	);
</script>

<div class="space-y-6">
	<h1 class="text-xl font-semibold">Dashboard</h1>

	<div class="grid grid-cols-2 gap-4 md:grid-cols-4">
		<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
			<div class="text-xs text-slate-400">Host CPU</div>
			<div class="mt-1 text-2xl font-semibold">
				{host?.cpuPct !== undefined ? `${host.cpuPct}%` : '—'}
			</div>
		</div>
		<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
			<div class="text-xs text-slate-400">Memory</div>
			<div class="mt-1 text-2xl font-semibold">
				{host?.memTotal
					? `${Math.round(((host.memTotal - (host.memAvailable ?? 0)) / host.memTotal) * 100)}%`
					: '—'}
			</div>
			<div class="text-xs text-slate-500">
				{fmtBytes(host?.memTotal ? host.memTotal - (host.memAvailable ?? 0) : undefined)} / {fmtBytes(
					host?.memTotal
				)}
			</div>
		</div>
		<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
			<div class="text-xs text-slate-400">Load average</div>
			<div class="mt-1 text-2xl font-semibold">
				{host?.load1 !== undefined ? `${host.load1} / ${host.load5} / ${host.load15}` : '—'}
			</div>
		</div>
		<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
			<div class="text-xs text-slate-400">Disk free</div>
			<div class="mt-1 text-2xl font-semibold">{fmtBytes(host?.diskFree)}</div>
		</div>
	</div>

	<section>
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-medium">Sites</h2>
			<a
				href="/sites/new"
				class="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
				>New site</a
			>
		</div>
		{#if data.sites.length === 0}
			<p class="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
				No sites yet. Create your first EmDash site.
			</p>
		{:else}
			<div class="overflow-hidden rounded-lg border border-slate-800">
				<table class="w-full text-sm">
					<thead class="bg-slate-900 text-left text-xs text-slate-400">
						<tr>
							<th class="px-4 py-2">Name</th>
							<th class="px-4 py-2">Status</th>
							<th class="px-4 py-2">Database</th>
							<th class="px-4 py-2">Created</th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-800">
						{#each data.sites as site (site.id)}
							<tr class="hover:bg-slate-900/60">
								<td class="px-4 py-2.5">
									<a href="/sites/{site.id}" class="font-medium text-sky-400 hover:underline"
										>{site.name}</a
									>
								</td>
								<td class="px-4 py-2.5"><StatusPill status={site.status} /></td>
								<td class="px-4 py-2.5 text-slate-400">{site.dbEngine}</td>
								<td class="px-4 py-2.5 text-slate-500"
									>{new Date(site.createdAt).toLocaleString()}</td
								>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</section>

	<div class="grid gap-6 lg:grid-cols-2">
		<section>
			<h2 class="mb-3 text-lg font-medium">Recent jobs</h2>
			{#if data.jobs.length === 0}
				<p class="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
					No jobs yet.
				</p>
			{:else}
				<div class="space-y-2">
					{#each data.jobs as job (job.id)}
						<a
							href="/jobs/{job.id}"
							class="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-2.5 text-sm hover:border-slate-700"
						>
							<span class="font-mono text-slate-300">{job.type}</span>
							<span class="flex items-center gap-3">
								{#if job.progress}<span class="text-xs text-slate-500">{job.progress}</span>{/if}
								<StatusPill status={job.status} />
							</span>
						</a>
					{/each}
				</div>
			{/if}
		</section>

		<section>
			<h2 class="mb-3 text-lg font-medium">Containers</h2>
			{#if containers.length === 0}
				<p class="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
					No managed containers yet.
				</p>
			{:else}
				<div class="overflow-hidden rounded-lg border border-slate-800">
					<table class="w-full text-sm">
						<thead class="bg-slate-900 text-left text-xs text-slate-400">
							<tr>
								<th class="px-4 py-2">Container</th>
								<th class="px-4 py-2">CPU</th>
								<th class="px-4 py-2">Memory</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-slate-800">
							{#each containers as c (c.name)}
								<tr>
									<td class="px-4 py-2.5 font-mono text-xs">{c.name}</td>
									<td class="px-4 py-2.5">{c.cpuPct}%</td>
									<td class="px-4 py-2.5">{fmtBytes(c.memBytes)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	</div>
</div>
