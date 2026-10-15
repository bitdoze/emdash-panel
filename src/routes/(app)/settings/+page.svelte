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
		<div class="rounded-md border border-bad/40 bg-bad/10 px-3 py-2 text-sm text-bad">
			{form.error}
		</div>
	{/if}

	<section class="rounded-lg border border-line bg-panel p-5">
		<h2 class="text-sm font-semibold text-zinc-300">Account security</h2>
		<p class="mt-1 text-sm text-mute">
			Passkeys are bound to this panel's hostname. Register one for phishing-resistant sign-in.
		</p>
		<div class="mt-3 flex items-center gap-3">
			<button
				type="button"
				onclick={addPasskey}
				class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
			>
				Register a passkey
			</button>
			{#if passkeyMsg}<span class="text-sm text-mute">{passkeyMsg}</span>{/if}
		</div>
	</section>

	<section class="rounded-lg border border-line bg-panel p-5">
		<h2 class="text-sm font-semibold text-zinc-300">Storage profiles</h2>
		<p class="mt-1 text-sm text-mute">
			S3-compatible credentials for media and backups. Keys are stored encrypted.
		</p>

		{#if data.profiles.length > 0}
			<div class="mt-4 overflow-hidden rounded-md border border-line">
				<table class="w-full text-sm">
					<thead class="bg-ink text-left text-xs text-mute">
						<tr>
							<th class="px-3 py-2">Name</th>
							<th class="px-3 py-2">Kind</th>
							<th class="px-3 py-2">Endpoint</th>
							<th class="px-3 py-2">Bucket</th>
							<th class="px-3 py-2"></th>
						</tr>
					</thead>
					<tbody class="divide-y divide-zinc-800">
						{#each data.profiles as p (p.id)}
							<tr>
								<td class="px-3 py-2">{p.name}</td>
								<td class="px-3 py-2 text-mute">{p.kind}</td>
								<td class="px-3 py-2 font-mono text-xs text-mute">{p.endpoint}</td>
								<td class="px-3 py-2 font-mono text-xs text-mute">{p.bucket}</td>
								<td class="px-3 py-2 text-right">
									<form method="POST" action="?/deleteStorageProfile" use:enhance>
										<input type="hidden" name="id" value={p.id} />
										<button
											type="submit"
											class="rounded border border-bad/40 px-2 py-0.5 text-xs text-bad hover:bg-bad/10"
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
				<span class="text-xs text-mute">Name</span>
				<input
					name="name"
					required
					placeholder="r2-media"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Kind</span>
				<select
					name="kind"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
				>
					<option value="media">media</option>
					<option value="backup">backup</option>
				</select>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Endpoint</span>
				<input
					name="endpoint"
					required
					placeholder="https://<account>.r2.cloudflarestorage.com"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Region</span>
				<input
					name="region"
					placeholder="auto"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Bucket</span>
				<input
					name="bucket"
					required
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Key prefix (optional)</span>
				<input
					name="prefix"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<label class="block">
				<span class="text-xs text-mute">Public URL (optional)</span>
				<input
					name="publicUrl"
					placeholder="https://cdn.example.com"
					class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
				/>
			</label>
			<div class="col-span-2 grid grid-cols-2 gap-3">
				<label class="block">
					<span class="text-xs text-mute">Access key ID</span>
					<input
						name="accessKeyId"
						required
						class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
					/>
				</label>
				<label class="block">
					<span class="text-xs text-mute">Secret access key</span>
					<input
						name="secretAccessKey"
						type="password"
						required
						class="mt-1 w-full rounded-md border border-line bg-panel-2 px-2 py-1.5 font-mono text-sm"
					/>
				</label>
			</div>
			<div class="col-span-2">
				<button
					type="submit"
					class="rounded-md bg-panel-2 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-600"
					>Add profile</button
				>
			</div>
		</form>
	</section>

	<section class="rounded-lg border border-line bg-panel p-5">
		<h2 class="text-sm font-semibold text-zinc-300">Admin domains</h2>
		<p class="mt-1 text-sm text-mute">
			Additional hostnames that also serve this panel. DNS must resolve to this server —
			certificates are issued automatically.
		</p>
		<div class="mt-3 space-y-1.5 text-sm">
			<div class="flex items-center justify-between rounded-md border border-line bg-panel-2/50 px-3 py-2">
				<span class="font-mono text-xs text-zinc-300">{data.panelHostname}</span>
				<span class="text-xs text-mute">primary</span>
			</div>
			{#each data.panelDomains as d (d)}
				<div class="flex items-center justify-between rounded-md border border-line px-3 py-2">
					<a href="https://{d}" target="_blank" rel="noopener" class="font-mono text-xs text-accent hover:underline">{d}</a>
					<form method="POST" action="?/removePanelDomain" use:enhance>
						<input type="hidden" name="hostname" value={d} />
						<button
							class="rounded border border-bad/40 px-2 py-0.5 text-xs text-bad hover:bg-bad/10"
							onclick={(e) => {
								if (!confirm(`Remove ${d}?`)) e.preventDefault();
							}}>Remove</button
						>
					</form>
				</div>
			{/each}
		</div>
		<form method="POST" action="?/addPanelDomain" class="mt-3 flex gap-2" use:enhance>
			<input
				name="hostname"
				placeholder="admin.emdashhq.com"
				class="min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-3 py-2 font-mono text-sm focus:border-accent focus:outline-none"
			/>
			<button
				type="submit"
				class="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:brightness-110"
				>Add domain</button
			>
		</form>
	</section>

	<section class="rounded-lg border border-line bg-panel p-5">
		<h2 class="mb-3 text-sm font-semibold text-zinc-300">Audit log</h2>
		{#if data.audit.length === 0}
			<p class="text-sm text-mute">No events yet.</p>
		{:else}
			<div class="max-h-96 space-y-1 overflow-y-auto font-mono text-xs">
				{#each data.audit as a (a.id)}
					<div class="flex gap-3 text-mute">
						<span class="shrink-0 text-zinc-500">{new Date(a.createdAt).toLocaleString()}</span>
						<span class="shrink-0 text-accent">{a.action}</span>
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
