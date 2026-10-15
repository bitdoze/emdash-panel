<script lang="ts">
	import type { ActionData } from './$types';
	import { enhance } from '$app/forms';

	let { form }: { form: ActionData } = $props();
	let submitting = $state(false);
</script>

<div class="flex min-h-screen items-center justify-center bg-ink px-4">
	<div class="w-full max-w-md rounded-xl border border-line bg-panel p-8 shadow-xl">
		<h1 class="text-2xl font-semibold text-zinc-50">EmDash Panel</h1>
		<p class="mt-2 text-sm text-mute">
			Create the owner account. You need the single-use setup token printed by the installer.
		</p>

		{#if form?.error}
			<div class="mt-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
				{form.error}
			</div>
		{/if}

		<form
			method="POST"
			class="mt-6 space-y-4"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update();
				};
			}}
		>
			<label class="block">
				<span class="text-sm text-zinc-300">Setup token</span>
				<input
					name="token"
					type="text"
					required
					autocomplete="off"
					placeholder="emp_setup_…"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-zinc-300">Your name</span>
				<input
					name="name"
					type="text"
					required
					autocomplete="name"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-zinc-300">Email</span>
				<input
					name="email"
					type="email"
					required
					autocomplete="email"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-zinc-300">Password (min. 10 chars)</span>
				<input
					name="password"
					type="password"
					required
					minlength="10"
					autocomplete="new-password"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
			>
				{submitting ? 'Creating account…' : 'Create owner account'}
			</button>
		</form>
	</div>
</div>
