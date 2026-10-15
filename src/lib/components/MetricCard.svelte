<script lang="ts">
	import type { Snippet } from 'svelte';
	import Sparkline from './Sparkline.svelte';
	let {
		label,
		value,
		sub,
		history = [],
		suffix = '',
		accent = 'var(--color-accent)',
		footer
	}: {
		label: string;
		value: string;
		sub?: string;
		history?: (number | null | undefined)[];
		suffix?: string;
		accent?: string;
		footer?: Snippet;
	} = $props();
</script>

<div class="rounded-xl border border-line bg-panel p-4 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
	<div class="flex items-baseline justify-between gap-2">
		<span class="text-xs font-medium tracking-wide text-mute uppercase">{label}</span>
		{#if sub}<span class="truncate text-xs text-zinc-500">{sub}</span>{/if}
	</div>
	<div class="mt-1.5 text-2xl font-semibold tracking-tight text-zinc-50">{value}</div>
	{#if history.length > 1}
		<div class="mt-2"><Sparkline values={history} {suffix} stroke={accent} height={44} /></div>
	{/if}
	{#if footer}<div class="mt-2">{@render footer()}</div>{/if}
</div>
