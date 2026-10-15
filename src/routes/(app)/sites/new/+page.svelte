<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import Card from '#lib/components/Card.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let submitting = $state(false);
	let storageMode = $state('local');
	let dbEngine = $state('sqlite');
	let sourceKind = $state<'bundled' | 'git' | 'image'>('bundled');

	const input =
		'mt-1 w-full rounded-md border border-line bg-panel-2 px-3 py-2 text-sm focus:border-accent focus:outline-none';
	const label = 'text-sm text-zinc-300';
	const hint = 'mt-1 block text-xs text-mute';
</script>

<div class="max-w-2xl space-y-6">
	<div>
		<h1 class="text-xl font-semibold tracking-tight">New site</h1>
		<p class="mt-0.5 text-sm text-mute">Provision a containerized EmDash site with its own domain.</p>
	</div>

	{#if form?.error}
		<div class="rounded-lg border border-bad/40 bg-bad/10 px-4 py-2.5 text-sm text-bad">
			{form.error}
		</div>
	{/if}

	<form
		method="POST"
		class="space-y-4"
		use:enhance={() => {
			submitting = true;
			return async ({ update }) => {
				submitting = false;
				await update();
			};
		}}
	>
		<Card title="Identity">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class={label}>Site name</span>
					<input
						name="name"
						type="text"
						required
						placeholder="my-site"
						pattern="[a-z0-9]([a-z0-9-]*[a-z0-9])?"
						class={input}
					/>
					<span class={hint}>Lowercase letters, digits, hyphens.</span>
				</label>
				<label class="block">
					<span class={label}>Hostname</span>
					<input name="hostname" type="text" required placeholder="site.emdashhq.com" class={input} />
					<span class={hint}>A certificate is issued automatically.</span>
				</label>
			</div>
		</Card>

		<Card title="Runtime" subtitle="Database and media storage">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class={label}>Database</span>
					<select name="dbEngine" bind:value={dbEngine} class={input}>
						<option value="sqlite">SQLite (local volume)</option>
						<option value="postgres" disabled={!data.postgresEnabled}>
							PostgreSQL{data.postgresEnabled ? '' : ' (not enabled)'}
						</option>
					</select>
				</label>
				<label class="block">
					<span class={label}>Media storage</span>
					<select name="storageMode" bind:value={storageMode} class={input}>
						<option value="local">Local (site volume)</option>
						<option value="s3" disabled={data.mediaProfiles.length === 0}>
							S3-compatible{data.mediaProfiles.length === 0 ? ' (no profile)' : ''}
						</option>
					</select>
				</label>
			</div>
			{#if storageMode === 's3'}
				<label class="mt-4 block">
					<span class={label}>Storage profile</span>
					<select name="storageProfileId" class={input}>
						{#each data.mediaProfiles as p (p.id)}
							<option value={p.id}>{p.name} ({p.bucket})</option>
						{/each}
					</select>
				</label>
			{/if}
		</Card>

		<Card title="Source" subtitle="Where the site's image comes from">
			<div class="mb-3 flex gap-1 rounded-lg bg-panel-2 p-1">
				{#each [['bundled', 'Bundled template'], ['git', 'Git repository'], ['image', 'Image ref']] as [k, l] (k)}
					<button
						type="button"
						onclick={() => (sourceKind = k as typeof sourceKind)}
						class="flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition {sourceKind === k
							? 'bg-accent text-white'
							: 'text-mute hover:text-zinc-200'}">{l}</button
					>
				{/each}
			</div>
			{#if sourceKind === 'bundled'}
				<p class="text-sm text-mute">
					Builds the pinned EmDash {dbEngine === 'postgres' ? 'postgres' : 'sqlite'} image bundled
					with this panel — fully offline and reproducible.
				</p>
			{:else if sourceKind === 'git'}
				<div class="grid gap-4 sm:grid-cols-3">
					<label class="block sm:col-span-2">
						<span class={label}>Repository URL</span>
						<input
							name="sourceRepo"
							type="text"
							placeholder="https://github.com/you/emdash-site.git"
							class="{input} font-mono"
						/>
					</label>
					<label class="block">
						<span class={label}>Ref</span>
						<input name="sourceRef" type="text" placeholder="main" class="{input} font-mono" />
					</label>
				</div>
				<span class={hint}>The repo must contain a Dockerfile at its root.</span>
			{:else}
				<label class="block">
					<span class={label}>Image reference</span>
					<input
						name="image"
						type="text"
						placeholder="registry.example.com/emdash-site:1.2.0"
						class="{input} font-mono"
					/>
				</label>
			{/if}
		</Card>

		<Card title="Resources" subtitle="Container limits">
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class={label}
						>CPU (millicores · {data.limits.cpuMillicores.min}–{data.limits.cpuMillicores.max})</span
					>
					<input
						name="cpuMillicores"
						type="number"
						min={data.limits.cpuMillicores.min}
						max={data.limits.cpuMillicores.max}
						step="50"
						value={data.limits.cpuMillicores.default}
						class={input}
					/>
					<span class={hint}>1000 = one full core.</span>
				</label>
				<label class="block">
					<span class={label}>Memory (MiB · {data.limits.memoryMb.min}–{data.limits.memoryMb.max})</span>
					<input
						name="memoryMb"
						type="number"
						min={data.limits.memoryMb.min}
						max={data.limits.memoryMb.max}
						step="64"
						value={data.limits.memoryMb.default}
						class={input}
					/>
				</label>
			</div>
		</Card>

		<button
			type="submit"
			disabled={submitting}
			class="w-full rounded-lg bg-accent px-4 py-2.5 text-sm font-medium text-white shadow-lg shadow-accent/20 hover:brightness-110 disabled:opacity-50"
		>
			{submitting ? 'Creating…' : 'Create site'}
		</button>
	</form>
</div>
