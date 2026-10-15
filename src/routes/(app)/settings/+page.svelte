<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { authClient } from '#lib/auth-client';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let passkeyMsg = $state('');

	async function addPasskey() {
		passkeyMsg = '';
		const res = await authClient.passkey.addPasskey();
		passkeyMsg = res?.error
			? (res.error.message ?? 'Could not register passkey')
			: 'Passkey registered';
	}
</script>

<div class="space-y-8">
	<h1 class="text-xl font-semibold">Settings</h1>

	{#if form?.error}
		<div class="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	<section class="rounded-lg border border-slate-800 bg-slate-900 p-5">
		<h2 class="text-sm font-semibold text-slate-300">Account security</h2>
		<p class="mt-1 text-sm text-slate-400">
			Passkeys are bound to this panel's hostname. Register one for phishing-resistant sign-in.
		</p>
		<div class="mt-3 flex items-center gap-3">
			<button
				type="button"
				onclick={addPasskey}
				class="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500"
			>
				Register a passkey
			</button>
			{#if passkeyMsg}<span class="text-sm text-slate-400">{passkeyMsg}</span>{/if}
		</div>
	</section>

	<section class="rounded-lg border border-slate-800 bg-slate-900 p-5">
		<h2 class="text-sm font-semibold text-slate-300">Storage profiles</h2>
		<p class="mt-1 text-sm text-slate-400">
			S3-compatible credentials for media and backups. Keys are stored encrypted.
		</p>

		{#if data.profiles.length > 0}
			<div class="mt-4 overflow-hidden rounded-md border border-slate-800">
				<table class="w-full text-sm">
					<thead class="bg-slate-950 text-left text-xs text-slate-500">
						<tr>
							<th class="px-3 py-2">Name</th>
							<th class="px-3 py-2">Kind</th>
							<th class="px-3 py-2">Endpoint</th>
							<th class="px-3 py-2">Bucket</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-slate-800">
						{#each data.profiles as p (p.id)}
							<tr>
								<td class="px-3 py-2">{p.name}</td>
								<td class="px-3 py-2 text-slate-400">{p.kind}</td>
								<td class="px-3 py-2 font-mono text-xs text-slate-400">{p.endpoint}</td>
								<td class="px-3 py-2 font-mono text-xs text-slate-400">{p.bucket}</td>
								<td class="px-3 py-2 text-right">
									<form method="POST" action="?/deleteStorageProfile" use:enhance>
										<input type="hidden" name="id" value={p.id} />
										<button
											type="submit"
											class="rounded border border-red-900 px-2 py-0.5 text-xs text-red-300 hover:bg-red-950"
											onclick={(e) => {
												if (!confirm(`Delete storage profile ${p.name}?`)) e.preventDefault();
											}}>Delete</button
										>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}

		<form
			method="POST"
			action="?/addStorageProfile"
			class="mt-4 grid grid-cols-2 gap-3"
			use:enhance
		>
			<label class="block">
				<span class="text-xs text-slate-400">Name</span>
				<input
					name="name"
					required
					placeholder="r2-media"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Kind</span>
				<select
					name="kind"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
				>
					<option value="media">media</option>
					<option value="backup">backup</option>
				</select>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Endpoint</span>
				<input
					name="endpoint"
					required
					placeholder="https://<account>.r2.cloudflarestorage.com"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Region</span>
				<input
					name="region"
					placeholder="auto"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Bucket</span>
				<input
					name="bucket"
					required
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Key prefix (optional)</span>
				<input
					name="prefix"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-slate-400">Public URL (optional)</span>
				<input
					name="publicUrl"
					placeholder="https://cdn.example.com"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<div class="col-span-2 grid grid-cols-2 gap-3">
				<label class="block">
					<span class="text-xs text-slate-400">Access key ID</span>
					<input
						name="accessKeyId"
						required
						class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
					/>
				</label>
				<label class="block">
					<span class="text-xs text-slate-400">Secret access key</span>
					<input
						name="secretAccessKey"
						type="password"
						required
						class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-sm"
					/>
				</label>
			</div>
			<div class="col-span-2">
				<button
					type="submit"
					class="rounded-md bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600"
					>Add profile</button
				>
			</div>
		</form>
	</section>

	<section class="rounded-lg border border-slate-800 bg-slate-900 p-5">
		<h2 class="mb-3 text-sm font-semibold text-slate-300">Audit log</h2>
		{#if data.audit.length === 0}
			<p class="text-sm text-slate-500">No events yet.</p>
		{:else}
			<div class="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
				{#each data.audit as a (a.id)}
					<div class="flex gap-3 text-slate-400">
						<span class="shrink-0 text-slate-600">{new Date(a.createdAt).toLocaleString()}</span>
						<span class="shrink-0 text-sky-400">{a.action}</span>
						<span class="truncate"
							>{a.targetType ?? ''}{a.targetId ? `:${a.targetId.slice(0, 8)}` : ''} {a.metadata ??
								''}</span
						>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>
