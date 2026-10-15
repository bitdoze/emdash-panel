<script lang="ts">
	import type { Snippet } from 'svelte';
	let {
		title,
		subtitle,
		actions,
		children,
		class: cls = ''
	}: {
		title?: string;
		subtitle?: string;
		actions?: Snippet;
		children: Snippet;
		class?: string;
	} = $props();
</script>

<section
	class="rounded-xl border border-line bg-panel shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-16px_rgba(0,0,0,0.6)] {cls}"
>
	{#if title}
		<header class="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
			<div>
				<h2 class="text-sm font-semibold text-zinc-100">{title}</h2>
				{#if subtitle}<p class="mt-0.5 text-xs text-mute">{subtitle}</p>{/if}
			</div>
			{#if actions}<div class="flex shrink-0 items-center gap-2">{@render actions()}</div>{/if}
		</header>
	{/if}
	<div class="px-5 py-4">{@render children()}</div>
</section>
