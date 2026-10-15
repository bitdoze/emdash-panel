<script lang="ts">
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	let { children, data }: LayoutProps = $props();

	const nav = [
		{ href: '/dashboard', label: 'Dashboard' },
		{ href: '/sites', label: 'Sites' },
		{ href: '/jobs', label: 'Jobs' },
		{ href: '/settings', label: 'Settings' }
	];
</script>

<div class="min-h-screen bg-slate-950 text-slate-100">
	<header class="border-b border-slate-800 bg-slate-900">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<div class="flex items-center gap-6">
				<a href="/dashboard" class="text-lg font-semibold tracking-tight">EmDash Panel</a>
				<nav class="flex items-center gap-1">
					{#each nav as item (item.href)}
						<a
							href={item.href}
							class="rounded-md px-3 py-1.5 text-sm {page.url.pathname.startsWith(item.href)
								? 'bg-slate-800 text-white'
								: 'text-slate-400 hover:text-slate-200'}"
						>
							{item.label}
						</a>
					{/each}
				</nav>
			</div>
			<div class="flex items-center gap-3">
				<span class="text-sm text-slate-400">{data.user.email}</span>
				<form method="POST" action="/logout">
					<button
						type="submit"
						class="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
					>
						Sign out
					</button>
				</form>
			</div>
		</div>
	</header>
	<main class="mx-auto max-w-6xl px-4 py-6">
		{@render children()}
	</main>
</div>
