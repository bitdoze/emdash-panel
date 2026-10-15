<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as UICard from '#lib/components/ui/card/index.js';
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

<UICard.Root class="border-line bg-panel shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_8px_24px_-16px_rgba(0,0,0,0.6)] ring-line {cls}">
	{#if title}
		<UICard.Header class="border-b border-line">
			<UICard.Title class="text-sm font-semibold text-zinc-100">{title}</UICard.Title>
			{#if subtitle}
				<UICard.Description class="text-xs text-mute">{subtitle}</UICard.Description>
			{/if}
			{#if actions}
				<UICard.Action>{@render actions()}</UICard.Action>
			{/if}
		</UICard.Header>
	{/if}
	<UICard.Content>{@render children()}</UICard.Content>
</UICard.Root>
