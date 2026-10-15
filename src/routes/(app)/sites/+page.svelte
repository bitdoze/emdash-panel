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
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold">Sites</h1>
		<a
			href="/sites/new"
			class="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
			>New site</a
		>
	</div>

	{#if data.sites.length === 0}
		<p class="rounded-lg border border-dashed border-slate-800 p-10 text-center text-sm text-slate-500">
			No sites yet. <a href="/sites/new" class="text-sky-400 hover:underline">Create one</a>.
		</p>
	{:else}
		<div class="overflow-hidden rounded-lg border border-slate-800">
			<table class="w-full text-sm">
				<thead class="bg-slate-900 text-left text-xs text-slate-400">
					<tr>
						<th class="px-4 py-2">Name</th>
						<th class="px-4 py-2">Domain</th>
						<th class="px-4 py-2">Status</th>
						<th class="px-4 py-2">Database</th>
						<th class="px-4 py-2">Storage</th>
						<th class="px-4 py-2">Image</th>
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
							<td class="px-4 py-2.5">
								{#each site.domains as d (d)}
									<a
										href="https://{d}"
										target="_blank"
										rel="noopener"
										class="block text-slate-300 hover:text-sky-400">{d}</a
									>
								{/each}
							</td>
							<td class="px-4 py-2.5">
								<StatusPill status={site.status} />
								{#if site.error}<div class="mt-1 text-xs text-red-400">{site.error}</div>{/if}
							</td>
							<td class="px-4 py-2.5 text-slate-400">{site.dbEngine}</td>
							<td class="px-4 py-2.5 text-slate-400">{site.storageMode}</td>
							<td class="max-w-40 truncate px-4 py-2.5 font-mono text-xs text-slate-500"
								>{site.image ?? 'default'}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
