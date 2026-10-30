<script lang="ts">
	// Одна серія стовпчиків: тонкі, закруглені зверху, з підказкою при наведенні.
	// Легенди нема — що показано, каже заголовок картки.

	interface Bar {
		label: string;
		value: number;
		/** Текст підказки; за замовчуванням «label — value». */
		tip?: string;
	}

	interface Props {
		bars: Bar[];
		/** Кожна n-та підпис осі X, щоб підписи не злипались. */
		every?: number;
		/** Індекс, після якого провести нульову лінію (для помилки в мс). */
		zeroAfter?: number;
		unit?: string;
	}

	let { bars, every = 1, zeroAfter, unit = '' }: Props = $props();

	const max = $derived(Math.max(1, ...bars.map((b) => b.value)));
	const top = $derived(niceCeil(max));
	const peak = $derived(bars.findIndex((b) => b.value === max && b.value > 0));
	let hover = $state<number | null>(null);

	function niceCeil(v: number) {
		const p = 10 ** Math.floor(Math.log10(v));
		for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
		return 10 * p;
	}
</script>

<div class="chart" role="img" aria-label={bars.map((b) => `${b.label}: ${b.value}${unit}`).join(', ')}>
	<div class="y num" aria-hidden="true">
		<span>{top}</span>
		<span>{top / 2}</span>
		<span>0</span>
	</div>
	<div class="plot">
		<div class="grid" aria-hidden="true"><i></i><i></i><i></i></div>
		<div class="cols">
			{#each bars as b, i (i)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="col"
					class:zero={zeroAfter === i}
					onpointerenter={() => (hover = i)}
					onpointerleave={() => (hover = null)}
				>
					<span class="bar" style:height="{(b.value / top) * 100}%">
						{#if hover === i}
							<span class="tip">{b.tip ?? `${b.label} — ${b.value}${unit}`}</span>
						{:else if i === peak && hover === null}
							<span class="peak num">{b.value}{unit}</span>
						{/if}
					</span>
				</div>
			{/each}
		</div>
		<div class="x num" aria-hidden="true">
			{#each bars as b, i (i)}
				<span>{i % every === 0 ? b.label : ''}</span>
			{/each}
		</div>
	</div>
</div>

<style lang="scss">
	.chart {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 8px;
		height: 200px;
	}

	.y {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		padding-bottom: 22px;
		font-size: 11px;
		color: var(--muted);
		text-align: right;

		span {
			transform: translateY(-50%);
		}

		span:last-child {
			transform: translateY(50%);
		}
	}

	.plot {
		position: relative;
		display: grid;
		grid-template-rows: 1fr 22px;
		min-width: 0;
	}

	.grid {
		position: absolute;
		inset: 0 0 22px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		pointer-events: none;

		i {
			height: 1px;
			background: var(--line);
		}
	}

	.cols {
		position: relative;
		display: flex;
		align-items: flex-end;
		gap: 2px;
		min-width: 0;
	}

	.col {
		position: relative;
		flex: 1;
		height: 100%;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		min-width: 0;
		cursor: default;

		&.zero::after {
			content: '';
			position: absolute;
			right: -2px;
			top: 0;
			bottom: 0;
			width: 1px;
			background: var(--line-hover);
		}

		&:hover .bar {
			opacity: 1;
		}
	}

	.bar {
		position: relative;
		width: min(24px, 100%);
		min-height: 0;
		background: var(--accent);
		border-radius: 4px 4px 0 0;
		opacity: 0.85;
		transition:
			height 250ms var(--ease),
			opacity var(--dur) var(--ease);
	}

	.peak {
		position: absolute;
		bottom: calc(100% + 4px);
		left: 50%;
		transform: translateX(-50%);
		font-size: 11px;
		color: var(--text);
		white-space: nowrap;
	}

	.tip {
		position: absolute;
		bottom: calc(100% + 6px);
		left: 50%;
		transform: translateX(-50%);
		z-index: 2;
		padding: 6px 8px;
		background: var(--bg);
		border: 1px solid var(--line-hover);
		border-radius: 8px;
		font-size: 12px;
		white-space: nowrap;
		pointer-events: none;
	}

	.col:first-child .tip {
		left: 0;
		transform: none;
	}

	.col:last-child .tip {
		left: auto;
		right: 0;
		transform: none;
	}

	.col:hover .bar {
		opacity: 1;
	}

	.x {
		display: flex;
		gap: 2px;
		padding-top: 6px;
		font-size: 10px;
		color: var(--muted);

		span {
			flex: 1;
			min-width: 0;
			text-align: center;
			white-space: nowrap;
			overflow: visible;
		}
	}
</style>
