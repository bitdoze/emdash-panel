<script lang="ts">
	import type { PageData } from './$types';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';

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
		<div class="overflow-hidden rounded-lg border border-line">
			<table class="w-full text-sm">
				<thead class="bg-panel text-left text-xs text-mute">
					<tr>
						<th class="px-4 py-2">Type</th>
						<th class="px-4 py-2">Status</th>
						<th class="px-4 py-2">Attempts</th>
						<th class="px-4 py-2">Created</th>
						<th class="px-4 py-2">Error</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-zinc-800">
					{#each data.jobs as job (job.id)}
						<tr class="hover:bg-panel/60">
							<td class="px-4 py-2.5">
								<a href="/jobs/{job.id}" class="font-mono text-xs text-accent hover:underline"
									>{job.type}</a
								>
							</td>
							<td class="px-4 py-2.5"><StatusPill status={job.status} /></td>
							<td class="px-4 py-2.5 text-mute">{job.attempts}</td>
							<td class="px-4 py-2.5 text-mute">{new Date(job.createdAt).toLocaleString()}</td>
							<td class="max-w-60 truncate px-4 py-2.5 text-xs text-red-400">{job.error ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
