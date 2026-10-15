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
			class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
			>New site</a
		>
	</div>

	{#if data.sites.length === 0}
		<p class="rounded-lg border border-dashed border-line p-10 text-center text-sm text-mute">
			No sites yet. <a href="/sites/new" class="text-accent hover:underline">Create one</a>.
		</p>
	{:else}
		<div class="overflow-hidden rounded-lg border border-line">
			<table class="w-full text-sm">
				<thead class="bg-panel text-left text-xs text-mute">
					<tr>
						<th class="px-4 py-2">Name</th>
						<th class="px-4 py-2">Domain</th>
						<th class="px-4 py-2">Status</th>
						<th class="px-4 py-2">Database</th>
						<th class="px-4 py-2">Storage</th>
						<th class="px-4 py-2">Image</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-800">
					{#each data.sites as site (site.id)}
						<tr class="hover:bg-panel/60">
							<td class="px-4 py-2.5">
								<a href="/sites/{site.id}" class="font-medium text-accent hover:underline"
									>{site.name}</a
								>
							</td>
							<td class="px-4 py-2.5">
								{#each site.domains as d (d)}
									<a
										href="https://{d}"
										target="_blank"
										rel="noopener"
										class="block text-zinc-300 hover:text-accent">{d}</a
									>
								{/each}
							</td>
							<td class="px-4 py-2.5">
								<StatusPill status={site.status} />
								{#if site.error}<div class="mt-1 text-xs text-red-400">{site.error}</div>{/if}
							</td>
							<td class="px-4 py-2.5 text-mute">{site.dbEngine}</td>
							<td class="px-4 py-2.5 text-mute">{site.storageMode}</td>
							<td class="max-w-40 truncate px-4 py-2.5 font-mono text-xs text-mute"
								>{site.image ?? 'default'}</td
							>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
