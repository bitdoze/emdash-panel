<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import * as Dialog from '#lib/components/ui/dialog/index.js';
	import { Button, type ButtonVariant } from '#lib/components/ui/button/index.js';

	let {
		title,
		description,
		confirmLabel = 'Confirm',
		action,
		fields,
		trigger,
		variant = 'destructive',
		children,
		open = $bindable(false)
	}: {
		title: string;
		description?: string;
		confirmLabel?: string;
		action: string;
		fields?: Record<string, string>;
		trigger: Snippet;
		variant?: ButtonVariant;
		children?: Snippet;
		open?: boolean;
	} = $props();

	let submitting = $state(false);
</script>

<Dialog.Root bind:open>
	<Dialog.Trigger>
		{#snippet child({ props })}
			<span {...props}>{@render trigger()}</span>
		{/snippet}
	</Dialog.Trigger>
	<Dialog.Content class="border-line bg-panel sm:max-w-md">
		<Dialog.Header>
			<Dialog.Title class="text-zinc-50">{title}</Dialog.Title>
			{#if description}
				<Dialog.Description class="text-mute">{description}</Dialog.Description>
			{/if}
		</Dialog.Header>
		<form
			method="POST"
			{action}
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					open = false;
					await update();
				};
			}}
		>
			{#each Object.entries(fields ?? {}) as [k, v] (k)}
				<input type="hidden" name={k} value={v} />
			{/each}
			{#if children}{@render children()}{/if}
			<Dialog.Footer class="mt-4">
				<Dialog.Close>
					{#snippet child({ props })}
						<Button {...props} type="button" variant="outline">Cancel</Button>
					{/snippet}
				</Dialog.Close>
				<Button type="submit" {variant} disabled={submitting}>
					{submitting ? 'Working…' : confirmLabel}
				</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
