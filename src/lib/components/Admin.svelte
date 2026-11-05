<script lang="ts">
	import { version } from '$app/environment';
	import { analytics } from '$lib/analytics.svelte';
	import type { Level } from '$lib/game/config';
	import type { Settings } from '$lib/local';

	interface Props {
		settings: Settings;
		attempts: number;
		best: number | null;
		epoch: string;
		onChange: (s: Settings) => void;
		onReset: () => void;
		onCalibrate: () => void;
		onClose: () => void;
	}

	let { settings, attempts, best, epoch, onChange, onReset, onCalibrate, onClose }: Props = $props();
	let confirmReset = $state(false);

	const LEVELS: { id: Level; note: string }[] = [
		{ id: 1, note: 'Шахед, потім Стінг' },
		{ id: 2, note: 'Порядок випадковий, пауза перед стартом, розкид швидкості ±30%' },
		{ id: 3, note: 'Два Шахеди, Стінг на будь-якому місці, дрони на 20% швидші' }
	];

	const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
	const latency = (d: number) => onChange({ ...settings, latencyMs: clamp(settings.latencyMs + d, 0, 300) });
	const speed = (d: number) =>
		onChange({ ...settings, speed: Math.round(clamp(settings.speed + d, 0.5, 2) * 100) / 100 });

	const time = (t: number | null) =>
		t === null ? 'ще не було' : new Date(t).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
</script>

<div class="backdrop">
	<section class="panel" aria-label="Налаштування стенду">
		<header>
			<h2>Налаштування стенду</h2>
			<button class="ghost" onclick={onClose}>Закрити</button>
		</header>

		<div class="row">
			<div>
				<p class="label">Рівень складності</p>
				<p class="note">{LEVELS[settings.level - 1].note}</p>
			</div>
			<div class="ctl" role="group" aria-label="Рівень складності">
				{#each LEVELS as l (l.id)}
					<button
						class="num level"
						class:on={settings.level === l.id}
						aria-pressed={settings.level === l.id}
						onclick={() => onChange({ ...settings, level: l.id })}
					>
						{l.id}
					</button>
				{/each}
			</div>
		</div>

		<div class="row">
			<div>
				<p class="label">Затримка сенсора</p>
				<p class="note">Віднімається від моменту дотику</p>
			</div>
			<div class="ctl">
				<button onclick={() => latency(-5)} aria-label="Менше">−</button>
				<span class="num val">{settings.latencyMs}&nbsp;мс</span>
				<button onclick={() => latency(5)} aria-label="Більше">+</button>
			</div>
		</div>
		<button class="wide" onclick={onCalibrate}>Калібрувати в такт</button>

		<div class="row">
			<div>
				<p class="label">Швидкість дронів</p>
				<p class="note">1.00 — як задумано</p>
			</div>
			<div class="ctl">
				<button onclick={() => speed(-0.05)} aria-label="Повільніше">−</button>
				<span class="num val">×{settings.speed.toFixed(2)}</span>
				<button onclick={() => speed(0.05)} aria-label="Швидше">+</button>
			</div>
		</div>

		<div class="row">
			<div>
				<p class="label">Режим кіоску</p>
				<p class="note">Ховає курсор, не дає екрану згаснути, позначає події як стендові</p>
			</div>
			<button
				class="toggle"
				class:on={settings.kiosk}
				role="switch"
				aria-checked={settings.kiosk}
				aria-label="Режим кіоску"
				onclick={() => onChange({ ...settings, kiosk: !settings.kiosk })}
			>
				<span></span>
			</button>
		</div>

		<div class="row">
			<div>
				<p class="label">Лічильник заходу</p>
				<p class="note">
					з <span class="num">{epoch}</span> · <span class="num">{attempts}</span> спроб · рекорд
					<span class="num">{best === null ? '—' : `${best.toFixed(1)}%`}</span>
				</p>
			</div>
			{#if confirmReset}
				<button
					class="danger"
					onclick={() => {
						onReset();
						confirmReset = false;
					}}>Точно обнулити</button
				>
			{:else}
				<button onclick={() => (confirmReset = true)}>Обнулити</button>
			{/if}
		</div>

		<footer>
			<span class:off={!analytics.online}>{analytics.online ? 'онлайн' : 'офлайн'}</span>
			<span>у черзі <span class="num">{analytics.queued}</span></span>
			<span>синхр. <span class="num">{time(analytics.lastSync)}</span></span>
			<span>версія <span class="num">{version}</span></span>
		</footer>
	</section>
</div>

<style lang="scss">
	.backdrop {
		position: fixed;
		inset: 0;
		z-index: 10;
		display: grid;
		place-items: center;
		padding: 16px max(16px, env(safe-area-inset-right)) 16px max(16px, env(safe-area-inset-left));
		background: rgba(0, 0, 0, 0.72);
		overflow-y: auto;
		animation: fade 180ms var(--ease) both;
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}

	.panel {
		width: min(560px, 100%);
		padding: 20px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 16px;
		display: grid;
		gap: 14px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;

		h2 {
			margin: 0;
			font-size: 20px;
			font-weight: 700;
		}
	}

	.row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
	}

	.label {
		margin: 0;
		font-size: 16px;
	}

	.note {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--muted);
		line-height: 1.4;
	}

	.ctl {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-shrink: 0;
	}

	.val {
		display: inline-block;
		min-width: 7ch;
		text-align: center;
		font-size: 14px;
	}

	button {
		min-height: 44px;
		min-width: 44px;
		padding: 0 14px;
		background: transparent;
		border: 1px solid var(--line);
		border-radius: 10px;
		font-size: 15px;
		cursor: pointer;
		flex-shrink: 0;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);

		&:hover {
			border-color: var(--line-hover);
		}
	}

	.level.on {
		background: var(--accent);
		border-color: var(--accent);
		color: var(--accent-ink);
	}

	.wide {
		width: 100%;
	}

	.ghost {
		border-color: transparent;
		color: var(--muted);
	}

	.danger {
		border-color: var(--accent);
		color: var(--accent);
	}

	.toggle {
		position: relative;
		width: 56px;
		padding: 0;

		span {
			position: absolute;
			top: 50%;
			left: 6px;
			width: 20px;
			height: 20px;
			margin-top: -10px;
			border-radius: 50%;
			background: var(--muted);
			transition:
				transform var(--dur) var(--ease),
				background var(--dur) var(--ease);
		}

		&.on {
			border-color: var(--accent);

			span {
				background: var(--accent);
				transform: translateX(22px);
			}
		}
	}

	footer {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 16px;
		padding-top: 14px;
		border-top: 1px solid var(--line);
		font-size: 12px;
		color: var(--muted);

		.off {
			color: var(--accent);
		}
	}
</style>
