<script lang="ts">
	import type { LayoutProps } from './$types';
	import { page } from '$app/state';

	let { children, data }: LayoutProps = $props();

	const nav = [
		{
			href: '/dashboard',
			label: 'Dashboard',
			icon: 'M3 3h7v7H3zM13 3h7v4h-7zM13 10h7v7h-7zM3 13h7v4H3z'
		},
		{
			href: '/sites',
			label: 'Sites',
			icon: 'M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5'
		},
		{
			href: '/jobs',
			label: 'Jobs',
			icon: 'M4 4h16v4H4zM4 12h10v4H4zM4 20h16v0H4zM17 11l3 3-3 3'
		},
		{
			href: '/settings',
			label: 'Settings',
			icon: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm8.5 4a6.5 6.5 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a6.6 6.6 0 0 0-2-1.2L15.6 3h-4L11 5.6a6.6 6.6 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a6.7 6.7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a6.6 6.6 0 0 0 2 1.2L11.6 21h4l.4-2.6a6.6 6.6 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.07-.4.1-.8.1-1.2Z'
		}
	];
</script>

<div class="flex min-h-screen bg-ink text-zinc-100">
	<aside
		class="fixed inset-y-0 left-0 z-30 flex w-56 flex-col border-r border-line bg-panel/80 backdrop-blur"
	>
		<a href="/dashboard" class="flex items-center gap-2.5 px-5 py-5">
			<div
				class="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-indigo-600 text-sm font-bold text-white shadow-lg shadow-accent/20"
			>
				E
			</div>
			<div>
				<div class="text-sm font-semibold tracking-tight">EmDash</div>
				<div class="text-[10px] tracking-widest text-mute uppercase">Panel</div>
			</div>
		</a>

		<nav class="mt-2 flex-1 space-y-0.5 px-3">
			{#each nav as item (item.href)}
				{@const active = page.url.pathname.startsWith(item.href)}
				<a
					href={item.href}
					class="group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors {active
						? 'bg-accent/15 text-white'
						: 'text-mute hover:bg-panel-2 hover:text-zinc-200'}"
				>
					<svg
						class="h-4 w-4 shrink-0 {active ? 'text-accent' : 'text-zinc-600 group-hover:text-zinc-400'}"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="1.6"
						stroke-linejoin="round"
					>
						<path d={item.icon} />
					</svg>
					{item.label}
					{#if active}<span class="ml-auto h-1.5 w-1.5 rounded-full bg-accent"></span>{/if}
				</a>
			{/each}
		</nav>

		<div class="border-t border-line px-3 py-3">
			<div class="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
				<div
					class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel-2 text-xs font-medium text-zinc-300"
				>
					{(data.user.email ?? '?')[0].toUpperCase()}
				</div>
				<span class="min-w-0 flex-1 truncate text-xs text-zinc-400">{data.user.email}</span>
				<form method="POST" action="/logout">
					<button
						type="submit"
						title="Sign out"
						class="rounded-md p-1.5 text-zinc-500 hover:bg-panel-2 hover:text-zinc-200"
					>
						<svg
							class="h-4 w-4"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.6"
						>
							<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />
						</svg>
					</button>
				</form>
			</div>
		</div>
	</aside>

	<main class="ml-56 min-w-0 flex-1">
		<div class="mx-auto max-w-6xl px-6 py-6 lg:px-8">
			{@render children()}
		</div>
	</main>
</div>
