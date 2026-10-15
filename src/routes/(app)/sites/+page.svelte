<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import { Button } from '#lib/components/ui/button/index.js';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data }: { data: PageData } = $props();

	onMount(() => {
		const t = setInterval(() => invalidateAll(), 5000);
		return () => clearInterval(t);
	});
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-semibold tracking-tight">Sites</h1>
		<Button href="/sites/new">New site</Button>
	</div>

	{#if data.sites.length === 0}
		<p class="rounded-lg border border-dashed border-line p-10 text-center text-sm text-mute">
			No sites yet. <a href="/sites/new" class="text-accent hover:underline">Create one</a>.
		</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row class="border-line hover:bg-transparent">
					<Table.Head>Name</Table.Head>
					<Table.Head>Domain</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Database</Table.Head>
					<Table.Head>Storage</Table.Head>
					<Table.Head>Image</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.sites as site (site.id)}
					<Table.Row class="border-line/60">
						<Table.Cell>
							<a href="/sites/{site.id}" class="font-medium text-accent hover:underline"
								>{site.name}</a
							>
						</Table.Cell>
						<Table.Cell>
							{#each site.domains as d (d)}
								<a
									href="https://{d}"
									target="_blank"
									rel="noopener"
									class="block text-zinc-300 hover:text-accent">{d}</a
								>
							{/each}
						</Table.Cell>
						<Table.Cell>
							<StatusPill status={site.status} />
							{#if site.error}<div class="mt-1 text-xs text-bad">{site.error}</div>{/if}
						</Table.Cell>
						<Table.Cell class="text-mute">{site.dbEngine}</Table.Cell>
						<Table.Cell class="text-mute">{site.storageMode}</Table.Cell>
						<Table.Cell class="max-w-40 truncate font-mono text-xs text-mute"
							>{site.image ?? 'default'}</Table.Cell
						>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
