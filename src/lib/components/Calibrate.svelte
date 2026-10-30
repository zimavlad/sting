<script lang="ts">
	import { onMount } from 'svelte';

	// Людина тапає в такт тому, що бачить, тож середній зсув від такту =
	// затримка екрана + сенсора. Саме її гра й віднімає від дотику.
	const BEAT_MS = 800;
	const TAPS = 16;
	const WARMUP = 4;

	let { onDone }: { onDone: (ms: number | null) => void } = $props();

	let start = 0;
	let offsets = $state<number[]>([]);
	let flash = $state(false);
	let result = $state<number | null>(null);

	function median(xs: number[]) {
		const s = [...xs].sort((a, b) => a - b);
		const m = s.length >> 1;
		return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
	}

	function tap(e: PointerEvent) {
		if (!e.isPrimary || result !== null) return;
		const stamp = e.timeStamp || performance.now();
		const k = Math.round((stamp - start) / BEAT_MS);
		offsets = [...offsets, stamp - (start + k * BEAT_MS)];
		if (offsets.length >= TAPS) result = Math.max(0, Math.round(median(offsets.slice(WARMUP))));
	}

	function again() {
		offsets = [];
		result = null;
		start = performance.now() + BEAT_MS;
	}

	onMount(() => {
		start = performance.now() + BEAT_MS;
		let raf = 0;
		const loop = (now: number) => {
			const phase = (now - start) % BEAT_MS;
			flash = now >= start && (phase < 90 || phase > BEAT_MS - 10);
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(raf);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="cal" onpointerdown={tap} oncontextmenu={(e) => e.preventDefault()}>
	<div class="beat" class:flash></div>
	{#if result === null}
		<p>Торкайся екрана рівно в такт спалахам</p>
		<p class="num count">{offsets.length} / {TAPS}</p>
	{:else}
		<p>Затримка ≈ <span class="num">{result}&nbsp;мс</span></p>
		<div class="actions">
			<button onpointerdown={(e) => e.stopPropagation()} onclick={() => onDone(result)}>Зберегти</button>
			<button onpointerdown={(e) => e.stopPropagation()} onclick={again}>Ще раз</button>
		</div>
	{/if}
	<button class="cancel" onpointerdown={(e) => e.stopPropagation()} onclick={() => onDone(null)}>Скасувати</button>
</div>

<style lang="scss">
	.cal {
		position: fixed;
		inset: 0;
		z-index: 20;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 20px;
		padding: 16px;
		background: var(--bg);
		touch-action: none;
		user-select: none;
		text-align: center;

		p {
			margin: 0;
			font-size: 20px;
		}
	}

	.beat {
		width: 160px;
		height: 160px;
		border-radius: 50%;
		border: 1px solid var(--line-hover);
		transition: background 60ms linear;

		&.flash {
			background: var(--accent);
			transition: none;
		}
	}

	.count {
		color: var(--muted);
		font-size: 16px !important;
		min-width: 7ch;
	}

	.actions {
		display: flex;
		gap: 10px;
	}

	button {
		min-height: 48px;
		padding: 0 20px;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 10px;
		font-size: 16px;
		cursor: pointer;

		&:hover {
			border-color: var(--line-hover);
		}
	}

	.cancel {
		position: absolute;
		top: 16px;
		right: 16px;
		color: var(--muted);
	}
</style>
