<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';
	import * as Table from '#lib/components/ui/table/index.js';

	let { data }: { data: PageData } = $props();
	onMount(() => {
		const t = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(t);
	});
</script>

<div class="space-y-6">
	<h1 class="text-xl font-semibold">Jobs</h1>
	{#if data.jobs.length === 0}
		<p class="rounded-lg border border-dashed border-line p-10 text-center text-sm text-mute">
			No jobs yet.
		</p>
	{:else}
		<Table.Root>
			<Table.Header>
				<Table.Row class="border-line hover:bg-transparent">
					<Table.Head>Type</Table.Head>
					<Table.Head>Status</Table.Head>
					<Table.Head>Attempts</Table.Head>
					<Table.Head>Created</Table.Head>
					<Table.Head>Error</Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each data.jobs as job (job.id)}
					<Table.Row class="border-line/60">
						<Table.Cell>
							<a href="/jobs/{job.id}" class="font-mono text-xs text-accent hover:underline"
								>{job.type}</a
							>
						</Table.Cell>
						<Table.Cell><StatusPill status={job.status} /></Table.Cell>
						<Table.Cell class="text-mute">{job.attempts}</Table.Cell>
						<Table.Cell class="text-mute">{new Date(job.createdAt).toLocaleString()}</Table.Cell>
						<Table.Cell class="max-w-60 truncate text-xs text-bad">{job.error ?? ''}</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	{/if}
</div>
