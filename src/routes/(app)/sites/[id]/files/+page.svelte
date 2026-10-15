<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import { enhance } from '$app/forms';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let showNewDir = $state(false);
	let showNewFile = $state(false);
	let showUpload = $state(false);

	function fmtBytes(n: number) {
		const units = ['B', 'KiB', 'MiB', 'GiB'];
		let i = 0;
		let v = n;
		while (v >= 1024 && i < units.length - 1) {
			v /= 1024;
			i++;
		}
		return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<a href="/sites/{data.site.id}" class="text-sm text-accent hover:underline"
				>← {data.site.name}</a
			>
			<h1 class="mt-1 text-xl font-semibold">Files</h1>
		</div>
	</div>

	{#if form?.error}
		<div class="rounded-md border border-red-500/40 bg-bad/10 px-3 py-2 text-sm text-bad">
			{form.error}
		</div>
	{/if}

	{#if data.file}
		<!-- File editor -->
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/60">
			<div class="flex items-center justify-between border-b border-zinc-800 px-4 py-2.5">
				<span class="font-mono text-sm text-zinc-300">{data.file.path}</span>
				<span class="text-xs text-zinc-500"
					>{fmtBytes(data.file.size)}{data.file.truncated ? ' · truncated preview' : ''}</span
				>
			</div>
			{#if data.fileError}
				<p class="p-4 text-sm text-bad">{data.fileError}</p>
			{:else if data.file.binary}
				<div class="flex items-center justify-between p-4">
					<p class="text-sm text-zinc-400">Binary file — editing not supported.</p>
					<a
						href="/sites/{data.site.id}/files/raw?path={encodeURIComponent(data.file.path ?? '')}"
						class="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
						>Download</a
					>
				</div>
			{:else}
				<form method="POST" action="?/saveFile" use:enhance>
					<input type="hidden" name="path" value={data.file.path} />
					<textarea
						name="content"
						class="h-[55vh] w-full resize-y bg-transparent p-4 font-mono text-xs leading-5 text-zinc-200 focus:outline-none"
						>{data.file.content}</textarea
					>
					<div class="flex items-center gap-2 border-t border-zinc-800 px-4 py-2.5">
						<button
							type="submit"
							class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
							>Save</button
						>
						<a
							href="/sites/{data.site.id}/files?path={encodeURIComponent(
								(data.file.path ?? '').split('/').slice(0, -1).join('/')
							)}"
							class="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
							>Back</a
						>
						<a
							href="/sites/{data.site.id}/files/raw?path={encodeURIComponent(data.file.path ?? '')}"
							class="ml-auto rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
							>Download</a
						>
					</div>
				</form>
			{/if}
		</div>
	{:else}
		<!-- Directory listing -->
		<div class="rounded-xl border border-zinc-800 bg-zinc-900/60">
			<div class="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-2.5">
				<nav class="flex min-w-0 flex-1 items-center gap-1 font-mono text-sm">
					<a href="/sites/{data.site.id}/files" class="text-accent hover:underline">data</a>
					{#each data.crumbs as crumb, i (i)}
						<span class="text-zinc-500">/</span>
						<a
							href="/sites/{data.site.id}/files?path={encodeURIComponent(
								data.crumbs.slice(0, i + 1).join('/')
							)}"
							class="truncate text-accent hover:underline">{crumb}</a
						>
					{/each}
				</nav>
				<button
					onclick={() => ((showNewDir = !showNewDir), (showNewFile = false), (showUpload = false))}
					class="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
					>New folder</button
				>
				<button
					onclick={() => ((showNewFile = !showNewFile), (showNewDir = false), (showUpload = false))}
					class="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
					>New file</button
				>
				<button
					onclick={() => ((showUpload = !showUpload), (showNewDir = false), (showNewFile = false))}
					class="rounded-md border border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-800"
					>Upload</button
				>
			</div>

			{#if showNewDir || showNewFile}
				<form
					method="POST"
					action="?/{showNewDir ? 'createDir' : 'createFile'}"
					class="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5"
					use:enhance
				>
					<input type="hidden" name="path" value={data.path} />
					<input
						name="name"
						placeholder={showNewDir ? 'folder-name' : 'file.txt'}
						required
						class="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-sm focus:border-accent focus:outline-none"
					/>
					<button
						type="submit"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
						>Create</button
					>
				</form>
			{/if}
			{#if showUpload}
				<form
					method="POST"
					action="?/upload"
					enctype="multipart/form-data"
					class="flex items-center gap-2 border-b border-zinc-800 px-4 py-2.5"
					use:enhance
				>
					<input type="hidden" name="path" value={data.path} />
					<input
						type="file"
						name="file"
						required
						class="min-w-0 flex-1 text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-700 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200"
					/>
					<button
						type="submit"
						class="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:brightness-110"
						>Upload</button
					>
				</form>
			{/if}

			{#if data.listError}
				<p class="p-4 text-sm text-bad">{data.listError}</p>
			{:else if data.entries.length === 0}
				<p class="p-4 text-sm text-zinc-500">Empty directory.</p>
			{:else}
				<table class="w-full text-sm">
					<tbody>
						{#each data.entries as e (e.path)}
							<tr class="border-b border-zinc-800/60 last:border-0 hover:bg-zinc-800/40">
								<td class="px-4 py-2">
									{#if e.kind === 'dir'}
										<a
											href="/sites/{data.site.id}/files?path={encodeURIComponent(e.path)}"
											class="flex items-center gap-2 text-accent hover:underline"
										>
											<svg class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor"
												><path
													d="M1 3.5A1.5 1.5 0 0 1 2.5 2h3.1c.4 0 .8.16 1.07.44L7.5 3.5h6A1.5 1.5 0 0 1 15 5v6.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 11.5v-8Z"
												/></svg
											>{e.name}</a
										>
									{:else}
										<a
											href="/sites/{data.site.id}/files?file={encodeURIComponent(e.path)}"
											class="flex items-center gap-2 text-zinc-200 hover:text-accent"
										>
											<svg class="h-4 w-4 text-zinc-500" viewBox="0 0 16 16" fill="currentColor"
												><path
													d="M4 1.5A1.5 1.5 0 0 1 5.5 0h3.6c.4 0 .78.16 1.06.44l3.4 3.4c.28.28.44.66.44 1.06v8.6a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 4 13.5v-12Z"
												/></svg
											>{e.name}</a
										>
									{/if}
								</td>
								<td class="w-28 px-2 py-2 text-right text-xs text-zinc-500"
									>{e.kind === 'file' ? fmtBytes(e.size) : ''}</td
								>
								<td class="w-44 px-2 py-2 text-right text-xs text-zinc-500"
									>{e.mtime ? new Date(e.mtime).toLocaleString() : ''}</td
								>
								<td class="w-10 px-2 py-1.5 text-right">
									<form
										method="POST"
										action="?/delete"
										use:enhance
										onsubmit={(ev) => {
											if (!confirm(`Delete ${e.name}?`)) ev.preventDefault();
										}}
									>
										<input type="hidden" name="path" value={e.path} />
										<button class="text-xs text-zinc-500 hover:text-red-400">✕</button>
									</form>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</div>
		<p class="text-xs text-zinc-500">
			Site data volume — uploads, the SQLite database and EmDash state live here.
		</p>
	{/if}
</div>
