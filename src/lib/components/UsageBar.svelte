<script lang="ts">
	let {
		value = 0,
		max = 100,
		label = '',
		detail = '',
		warnAt = 80
	}: { value?: number; max?: number; label?: string; detail?: string; warnAt?: number } = $props();
	let pct = $derived(max > 0 ? Math.min(100, (value / max) * 100) : 0);
	let tone = $derived(pct >= warnAt ? 'bg-bad' : pct >= warnAt * 0.6 ? 'bg-warn' : 'bg-accent');
</script>

<div>
	{#if label || detail}
		<div class="mb-1 flex justify-between text-xs">
			<span class="text-zinc-400">{label}</span><span class="text-mute">{detail}</span>
		</div>
	{/if}
	<div class="h-1.5 overflow-hidden rounded-full bg-zinc-800">
		<div
			class="h-full rounded-full transition-all duration-500 {tone}"
			style="width:{pct.toFixed(1)}%"
		></div>
	</div>
</div>
