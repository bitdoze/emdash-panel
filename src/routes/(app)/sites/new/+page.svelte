<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
	let storageMode = $state('local');
	let dbEngine = $state('sqlite');
</script>

<div class="max-w-xl space-y-6">
	<h1 class="text-xl font-semibold">New site</h1>

	{#if form?.error}
		<div class="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		class="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		<label class="block">
			<span class="text-sm text-slate-300">Site name</span>
			<input
				name="name"
				type="text"
				required
				placeholder="my-site"
				pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
				class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
			/>
			<span class="mt-1 block text-xs text-slate-500">Lowercase letters, digits, hyphens.</span>
		</label>

		<label class="block">
			<span class="text-sm text-slate-300">Hostname</span>
			<input
				name="hostname"
				type="text"
				required
				placeholder="site1.emdashhq.com"
				class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
			/>
			<span class="mt-1 block text-xs text-slate-500">
				DNS must already point at this server. A certificate is issued automatically.
			</span>
		</label>

		<div class="grid grid-cols-2 gap-4">
			<label class="block">
				<span class="text-sm text-slate-300">Database</span>
				<select
					name="dbEngine"
					bind:value={dbEngine}
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
				>
					<option value="sqlite">SQLite (local volume)</option>
					<option value="postgres" disabled={!data.postgresEnabled}>
						PostgreSQL{data.postgresEnabled ? '' : ' (not enabled)'}
					</option>
				</select>
			</label>
			<label class="block">
				<span class="text-sm text-slate-300">Media storage</span>
				<select
					name="storageMode"
					bind:value={storageMode}
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
				>
					<option value="local">Local (site volume)</option>
					<option value="s3" disabled={data.mediaProfiles.length === 0}>
						S3-compatible{data.mediaProfiles.length === 0 ? ' (no profile)' : ''}
					</option>
				</select>
			</label>
		</div>

		{#if storageMode === 's3'}
			<label class="block">
				<span class="text-sm text-slate-300">Storage profile</span>
				<select
					name="storageProfileId"
					class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
				>
					{#each data.mediaProfiles as p (p.id)}
						<option value={p.id}>{p.name} ({p.bucket})</option>
					{/each}
				</select>
			</label>
		{/if}

		<label class="block">
			<span class="text-sm text-slate-300">Image override (optional)</span>
			<input
				name="image"
				type="text"
				placeholder="registry.example.com/emdash-site:1.2.0"
				class="mt-1 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-sm focus:border-sky-500 focus:outline-none"
			/>
			<span class="mt-1 block text-xs text-slate-500">
				Leave blank to use this installation's default EmDash runtime image.
			</span>
		</label>

		<button
			type="submit"
			disabled={submitting}
			class="w-full rounded-md bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
		>
			{submitting ? 'Creating…' : 'Create site'}
		</button>
	</form>
</div>
