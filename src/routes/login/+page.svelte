<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { authClient } from '#lib/auth-client';
	import { goto } from '$app/navigation';

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

<div class="flex min-h-screen items-center justify-center bg-slate-950 px-4">
	<div class="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
		<h1 class="text-2xl font-semibold text-slate-50">Sign in</h1>

		{#if form?.error}
			<div class="mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
				{form.error}
			</div>
		{/if}
		{#if passkeyError}
			<div class="mt-4 rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
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
				<span class="text-sm text-slate-300">Email</span>
				<input
					name="email"
					type="email"
					required
					autocomplete="email webauthn"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
				/>
			</label>
			<label class="block">
				<span class="text-sm text-slate-300">Password</span>
				<input
					name="password"
					type="password"
					required
					autocomplete="current-password"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
				/>
			</label>
			<button
				type="submit"
				disabled={submitting}
				class="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
			>
				{submitting ? 'Signing in…' : 'Sign in'}
			</button>
		</form>

		<div class="mt-4 border-t border-slate-800 pt-4">
			<button
				type="button"
				onclick={signInWithPasskey}
				class="w-full rounded-md border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
			>
				Sign in with a passkey
			</button>
		</div>
	</div>
</div>
