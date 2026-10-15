<script lang="ts">
	import type { PageData } from './$types';
	import { onMount, untrack } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';

	let { data }: { data: PageData } = $props();

	interface EventRow {
		id: number;
		ts: string;
		level: string;
		message: string;
	}
	let events = $state<EventRow[]>(untrack(() => data.events));
	let jobStatus = $state<string>(untrack(() => data.job.status));
	let logEl: HTMLDivElement | undefined = $state();

	onMount(() => {
		const source = new EventSource(`/api/jobs/${data.job.id}/events?after=${events.at(-1)?.id ?? 0}`);
		source.onmessage = (msg) => {
			const parsed = JSON.parse(msg.data) as
				| { kind: 'events'; events: EventRow[]; status: string }
				| { kind: 'status'; status: string };
			if (parsed.kind === 'events') {
				events = [...events, ...parsed.events];
				jobStatus = parsed.status;
			} else {
				jobStatus = parsed.status;
			}
		};
		return () => source.close();
	});

	$effect(() => {
		events.length;
		logEl?.scrollTo({ top: logEl.scrollHeight });
	});
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="font-mono text-xl font-semibold">{data.job.type}</h1>
			<p class="mt-0.5 text-sm text-mute">{data.job.id}</p>
		</div>
		<StatusPill status={jobStatus} />
	</div>

	{#if data.job.error}
		<div class="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
			{data.job.error}
		</div>
	{/if}

	<div
		bind:this={logEl}
		class="h-[60vh] overflow-y-auto rounded-lg border border-line bg-ink p-4 font-mono text-xs leading-5"
	>
		{#each events as e (e.id)}
			<div class="flex gap-3">
				<span class="shrink-0 text-zinc-500">{new Date(e.ts).toLocaleTimeString()}</span>
				<span
					class="shrink-0 {e.level === 'error'
						? 'text-red-400'
						: e.level === 'warn'
							? 'text-amber-400'
							: 'text-mute'}">{e.level}</span
				>
				<span class="whitespace-pre-wrap break-all text-zinc-300">{e.message}</span>
			</div>
		{:else}
			<p class="text-zinc-500">Waiting for log output…</p>
		{/each}
	</div>
</div>
