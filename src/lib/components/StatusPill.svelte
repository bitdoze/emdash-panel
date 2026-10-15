<script lang="ts">
	import { Badge } from '#lib/components/ui/badge/index.js';

	let { status }: { status: string } = $props();

	const tones: Record<string, string> = {
		ready: 'border-ok/40 bg-ok/15 text-ok',
		succeeded: 'border-ok/40 bg-ok/15 text-ok',
		complete: 'border-ok/40 bg-ok/15 text-ok',
		running: 'border-accent/40 bg-accent/15 text-accent',
		provisioning: 'border-accent/40 bg-accent/15 text-accent',
		queued: 'border-line bg-panel-2 text-zinc-300',
		pending: 'border-line bg-panel-2 text-zinc-300',
		awaiting_setup: 'border-warn/40 bg-warn/15 text-warn',
		stopped: 'border-line bg-panel-2 text-mute',
		failed: 'border-bad/40 bg-bad/15 text-bad',
		error: 'border-bad/40 bg-bad/15 text-bad',
		deleting: 'border-bad/40 bg-bad/15 text-bad',
		cancelled: 'border-line bg-panel-2 text-mute'
	};
</script>

<Badge variant="outline" class={tones[status] ?? tones.queued}>
	{status.replaceAll('_', ' ')}
</Badge>
