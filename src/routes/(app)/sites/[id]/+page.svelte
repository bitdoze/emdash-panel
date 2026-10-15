<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import StatusPill from '#lib/components/StatusPill.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	onMount(() => {
		const t = setInterval(() => invalidateAll(), 4000);
		return () => clearInterval(t);
	});

	function fmtBytes(n?: number | null) {
		if (n === undefined || n === null) return '—';
		const units = ['B', 'KiB', 'MiB', 'GiB'];
		let i = 0;
		while (n >= 1024 && i < units.length - 1) {
			n /= 1024;
			i++;
		}
		return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-semibold">{data.site.name}</h1>
			<p class="mt-0.5 text-sm text-slate-400">
				{#each data.domains as d, i (d.id)}{#if i > 0}, {/if}<a
						href="https://{d.hostname}"
						target="_blank"
						rel="noopener"
						class="text-sky-400 hover:underline">{d.hostname}</a
					>{/each}
			</p>
		</div>
		<StatusPill status={data.site.status} />
	</div>

	{#if form?.error}
		<div class="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
			{form.error}
		</div>
	{/if}

	{#if data.site.error}
		<div class="rounded-md border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-300">
			{data.site.error}
		</div>
	{/if}

	{#if data.gateCredentials}
		<div class="rounded-lg border border-amber-800 bg-amber-950/40 p-4">
			<h2 class="text-sm font-semibold text-amber-300">CMS setup is protected</h2>
			<p class="mt-1 text-sm text-slate-300">
				Visit
				<a
					href="https://{data.domains[0]?.hostname}/_emdash/admin/"
					target="_blank"
					rel="noopener"
					class="text-sky-400 hover:underline">https://{data.domains[0]?.hostname}/_emdash/admin/</a
				>
				and sign in with the gate credential below to finish EmDash owner setup. Then return here
				and click <strong>Setup complete</strong> to open the site fully.
			</p>
			<div class="mt-3 flex flex-wrap gap-4 font-mono text-sm">
				<span class="rounded bg-slate-800 px-2 py-1"
					>user: <strong>{data.gateCredentials.username}</strong></span
				>
				<span class="rounded bg-slate-800 px-2 py-1"
					>pass: <strong>{data.gateCredentials.password}</strong></span
				>
			</div>
			<form method="POST" action="?/completeSetup" class="mt-3" use:enhance>
				<button
					type="submit"
					class="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
				>
					Setup complete — remove gate
				</button>
			</form>
		</div>
	{/if}

	<div class="grid gap-6 lg:grid-cols-3">
		<section class="rounded-lg border border-slate-800 bg-slate-900 p-4 lg:col-span-1">
			<h2 class="mb-3 text-sm font-semibold text-slate-300">Details</h2>
			<dl class="space-y-2 text-sm">
				<div class="flex justify-between"><dt class="text-slate-500">Database</dt><dd>{data.site.dbEngine}</dd></div>
				<div class="flex justify-between"><dt class="text-slate-500">Storage</dt><dd>{data.site.storageMode}</dd></div>
				<div class="flex justify-between gap-2">
					<dt class="text-slate-500">Image</dt>
					<dd class="truncate font-mono text-xs">{data.site.image ?? 'default'}</dd>
				</div>
				<div class="flex justify-between gap-2">
					<dt class="text-slate-500">Container</dt>
					<dd class="truncate font-mono text-xs">{data.site.containerName ?? '—'}</dd>
				</div>
				<div class="flex justify-between">
					<dt class="text-slate-500">Created</dt>
					<dd>{new Date(data.site.createdAt).toLocaleString()}</dd>
				</div>
			</dl>

			<h3 class="mt-5 mb-2 text-sm font-semibold text-slate-300">Domains</h3>
			<ul class="space-y-1 text-sm">
				{#each data.domains as d (d.id)}
					<li class="flex items-center justify-between">
						<span class="text-slate-300">{d.hostname}</span>
						<StatusPill status={d.state} />
					</li>
				{/each}
			</ul>
			<form method="POST" action="?/addDomain" class="mt-3 flex gap-2" use:enhance>
				<input
					name="hostname"
					placeholder="extra.emdashhq.com"
					class="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs focus:border-sky-500 focus:outline-none"
				/>
				<button
					type="submit"
					class="rounded-md border border-slate-700 px-2 py-1 text-xs hover:bg-slate-800">Add</button
				>
			</form>
		</section>

		<section class="space-y-6 lg:col-span-2">
			<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
				<h2 class="mb-3 text-sm font-semibold text-slate-300">Actions</h2>
				<div class="flex flex-wrap gap-2">
					<form method="POST" action="?/start" use:enhance>
						<button
							class="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
							disabled={data.site.status !== 'stopped'}>Start</button
						>
					</form>
					<form method="POST" action="?/stop" use:enhance>
						<button
							class="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
							disabled={!['ready', 'awaiting_setup'].includes(data.site.status)}>Stop</button
						>
					</form>
					<form method="POST" action="?/backup" use:enhance>
						<button
							class="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800 disabled:opacity-40"
							disabled={!['ready', 'awaiting_setup', 'stopped'].includes(data.site.status)}
							>Run backup</button
						>
					</form>
					<form
						method="POST"
						action="?/delete"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Delete this site? Its container, routes and database will be removed.'))
								e.preventDefault();
						}}
					>
						<input type="hidden" name="purgeData" value="off" />
						<button
							type="submit"
							class="rounded-md border border-red-900 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
							onclick={(e) => {
								const input = (e.currentTarget as HTMLButtonElement).form!.querySelector(
									'input[name=purgeData]'
								) as HTMLInputElement;
								input.value = confirm('Also delete the data volume and stored secrets?')
									? 'on'
									: 'off';
							}}>Delete</button
						>
					</form>
				</div>
				{#if data.hasActiveJob}
					<p class="mt-2 text-xs text-slate-500">A job is currently running for this site.</p>
				{/if}
			</div>

			<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
				<h2 class="mb-3 text-sm font-semibold text-slate-300">Jobs</h2>
				{#if data.jobs.length === 0}
					<p class="text-sm text-slate-500">No jobs yet.</p>
				{:else}
					<div class="space-y-1.5">
						{#each data.jobs as job (job.id)}
							<a
								href="/jobs/{job.id}"
								class="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 text-sm hover:border-slate-700"
							>
								<span class="font-mono text-xs">{job.type}</span>
								<span class="flex items-center gap-2">
									{#if job.progress}<span class="text-xs text-slate-500">{job.progress}</span>{/if}
									<StatusPill status={job.status} />
								</span>
							</a>
						{/each}
					</div>
				{/if}
			</div>

			<div class="rounded-lg border border-slate-800 bg-slate-900 p-4">
				<h2 class="mb-3 text-sm font-semibold text-slate-300">Backups</h2>
				{#if data.backups.length === 0}
					<p class="text-sm text-slate-500">No backups yet.</p>
				{:else}
					<div class="space-y-1.5">
						{#each data.backups as b (b.id)}
							<div
								class="flex items-center justify-between rounded-md border border-slate-800 px-3 py-2 text-sm"
							>
								<span class="text-slate-300">{new Date(b.createdAt).toLocaleString()}</span>
								<span class="flex items-center gap-3">
									<span class="text-xs text-slate-500">{fmtBytes(b.sizeBytes)}</span>
									<StatusPill status={b.status} />
								</span>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</section>
	</div>
</div>
