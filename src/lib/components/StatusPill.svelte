<script lang="ts">
	let { status }: { status: string } = $props();

	const colors: Record<string, string> = {
		ready: 'bg-emerald-950 text-emerald-300 border-emerald-800',
		succeeded: 'bg-emerald-950 text-emerald-300 border-emerald-800',
		complete: 'bg-emerald-950 text-emerald-300 border-emerald-800',
		running: 'bg-sky-950 text-sky-300 border-sky-800',
		provisioning: 'bg-sky-950 text-sky-300 border-sky-800',
		queued: 'bg-slate-800 text-slate-300 border-slate-700',
		pending: 'bg-slate-800 text-slate-300 border-slate-700',
		awaiting_setup: 'bg-amber-950 text-amber-300 border-amber-800',
		stopped: 'bg-slate-800 text-slate-400 border-slate-700',
		failed: 'bg-red-950 text-red-300 border-red-800',
		error: 'bg-red-950 text-red-300 border-red-800',
		deleting: 'bg-red-950 text-red-300 border-red-800',
		cancelled: 'bg-slate-800 text-slate-400 border-slate-700'
	};
</script>

<span
	class="inline-block rounded-full border px-2 py-0.5 text-xs font-medium {colors[status] ??
		'bg-slate-800 text-slate-300 border-slate-700'}"
>
	{status.replaceAll('_', ' ')}
</span>
