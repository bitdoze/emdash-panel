<script lang="ts">
	let {
		values,
		height = 56,
		stroke = 'var(--color-accent)',
		fill = true,
		min,
		max,
		suffix = ''
	}: {
		values: (number | null | undefined)[];
		height?: number;
		stroke?: string;
		fill?: boolean;
		min?: number;
		max?: number;
		suffix?: string;
	} = $props();

	const W = 240;
	let pts = $derived.by(() => {
		const vals = values.filter((v): v is number => v != null && Number.isFinite(v));
		if (vals.length === 0) return { line: '', area: '', last: null as number | null, lo: 0, hi: 0 };
		const lo = min ?? Math.min(...vals);
		const hi = max ?? Math.max(...vals);
		const span = hi - lo || 1;
		const step = W / Math.max(values.length - 1, 1);
		const coords = values.map((v, i) => {
			const y =
				v == null || !Number.isFinite(v)
					? height - 1
					: height - 3 - ((v - lo) / span) * (height - 6);
			return `${(i * step).toFixed(1)},${Math.max(1, Math.min(height - 1, y)).toFixed(1)}`;
		});
		return {
			line: coords.join(' '),
			area: `0,${height} ${coords.join(' ')} ${W},${height}`,
			last: vals[vals.length - 1],
			lo,
			hi
		};
	});
</script>

<div class="w-full">
	<svg
		viewBox="0 0 {W} {height}"
		preserveAspectRatio="none"
		class="block w-full"
		style="height:{height}px"
		aria-hidden="true"
	>
		{#if pts.area && fill}
			<polygon points={pts.area} fill={stroke} opacity="0.14" />
		{/if}
		{#if pts.line}
			<polyline
				points={pts.line}
				fill="none"
				{stroke}
				stroke-width="1.5"
				stroke-linejoin="round"
				stroke-linecap="round"
				vector-effect="non-scaling-stroke"
			/>
		{/if}
	</svg>
	{#if pts.last != null}
		<div class="mt-1 flex justify-between text-[10px] text-mute">
			<span>{Math.round(pts.lo)}{suffix}</span>
			<span>{Math.round(pts.hi)}{suffix}</span>
		</div>
	{/if}
</div>
