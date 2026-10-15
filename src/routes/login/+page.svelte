<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { authClient } from '#lib/auth-client';
	import { goto } from '$app/navigation';
	import { Button } from '#lib/components/ui/button/index.js';

	let { form }: { form: ActionData; data: PageData } = $props();
	let submitting = $state(false);
	let passkeyError = $state('');

	async function signInWithPasskey() {
		passkeyError = '';
		const res = await authClient.signIn.passkey({ autoFill: false });
		if (res?.error) passkeyError = res.error.message ?? 'Passkey sign-in failed';
		else await goto('/dashboard');
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-ink px-4">
	<div
		class="w-full max-w-md rounded-xl border border-line bg-panel p-8 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_60px_-24px_rgba(0,0,0,0.8)]"
	>
		<div class="flex items-center gap-3">
			<div
				class="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-indigo-600 font-bold text-white shadow-lg shadow-accent/25"
			>
				E
			</div>
			<div>
				<div class="font-semibold tracking-tight text-zinc-50">EmDash Panel</div>
				<div class="text-xs text-mute">Site operations</div>
			</div>
		</div>
		<h1 class="mt-6 text-xl font-semibold text-zinc-50">Sign in</h1>

		{#if form?.error}
			<div class="mt-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
				{form.error}
			</div>
		{/if}
		{#if passkeyError}
			<div class="mt-4 rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
				{passkeyError}
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
				<span class="text-sm text-zinc-300">Email</span>
				<input
					name="email"
					type="email"
					required
					autocomplete="email webauthn"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-zinc-300">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete="current-password"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm text-zinc-100 focus:border-accent focus:outline-none"
				/>
			</label>
			<Button type="submit" disabled={submitting} class="w-full">
				{submitting ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>

		<div class="mt-4 border-t border-line pt-4">
			<Button variant="outline" type="button" onclick={signInWithPasskey} class="w-full">
				Sign in with a passkey
			</Button>
		</div>
	</div>
</div>
