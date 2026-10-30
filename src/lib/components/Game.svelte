<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { analytics } from '$lib/analytics.svelte';
	import { TIMING } from '$lib/game/config';
	import { Game } from '$lib/game/game.svelte';
	import { Renderer } from '$lib/game/render';
	import { STRINGS, type Lang } from '$lib/i18n';
	import {
		currentEpoch,
		loadScores,
		loadSettings,
		saveScores,
		saveSettings,
		startNewEpoch,
		uid,
		type Settings
	} from '$lib/local';
	import Admin from './Admin.svelte';
	import Calibrate from './Calibrate.svelte';

	let stage: HTMLDivElement;
	let canvasEl: HTMLCanvasElement;

	let lang = $state<Lang>('en');
	let settings = $state<Settings>(loadSettings());
	const initialEpoch = currentEpoch();
	let epoch = $state(initialEpoch);
	let scores = $state<number[]>(loadScores(initialEpoch));
	let adminOpen = $state(false);
	let calibrating = $state(false);
	let needsReload = false;

	const s = $derived(STRINGS[lang]);
	const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const shown = new Tween(0, { duration: reduced ? 0 : 650, easing: cubicOut });

	const game = new Game({
		latencyMs: () => settings.latencyMs,
		speed: () => settings.speed,
		scores: () => scores,
		onStart: () => {
			analytics.session = uid().slice(0, 12);
			analytics.track('start', { lang });
		},
		onAttempt: (j, round, attempt, latencyMs) => {
			scores = [...scores, j.score];
			saveScores(epoch, scores);
			analytics.track('attempt', {
				outcome: j.outcome,
				score: j.score,
				dx: j.dx === null ? null : Math.round(j.dx),
				errMs: j.errMs === null ? null : Math.round(j.errMs),
				stingSpeed: Math.round(round.sting.speed),
				gap: Math.round(round.gap * 1000) / 1000,
				speed: settings.speed,
				latencyMs,
				n: attempt,
				lang
			});
		},
		onEnd: (attempts, ms) => {
			analytics.track('end', { attempts, ms: Math.round(ms) });
			analytics.session = undefined;
			lang = 'en';
			if (needsReload) location.reload();
		}
	});

	$effect(() => {
		const j = game.judgement;
		if (!j) return;
		shown.set(0, { duration: 0 }).then(() => shown.set(j.score));
	});

	function setLang(next: Lang) {
		if (next === lang) return;
		lang = next;
		analytics.track('lang', { lang });
	}

	// --- дотики -------------------------------------------------------------

	let holdTimer: ReturnType<typeof setTimeout> | undefined;
	let held = false;

	function inAdminCorner(e: PointerEvent) {
		const r = stage.getBoundingClientRect();
		return e.clientX - r.left < r.width * 0.08 && e.clientY - r.top < r.height * 0.12;
	}

	function onDown(e: PointerEvent) {
		if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
		held = false;
		if (game.phase === 'flight') {
			game.press(e.timeStamp || performance.now());
			return;
		}
		if (game.phase === 'attract' && inAdminCorner(e)) {
			holdTimer = setTimeout(() => {
				held = true;
				adminOpen = true;
				analytics.track('admin', { action: 'open' });
			}, TIMING.adminHoldMs);
		}
	}

	function onUp(e: PointerEvent) {
		clearTimeout(holdTimer);
		if (!e.isPrimary || held || adminOpen) return;
		game.release(performance.now());
	}

	function cancelHold() {
		clearTimeout(holdTimer);
	}

	// --- налаштування стенду ---------------------------------------------------

	function updateSettings(next: Settings) {
		const changed = Object.fromEntries(
			Object.entries(next).filter(([k, v]) => settings[k as keyof Settings] !== v)
		);
		settings = next;
		saveSettings(next);
		if (Object.keys(changed).length) analytics.track('admin', { action: 'settings', ...changed });
		applyKiosk();
	}

	function resetCounter() {
		const prev = { epoch, attempts: scores.length };
		epoch = startNewEpoch();
		scores = [];
		analytics.setEpoch(epoch);
		analytics.track('admin', { action: 'reset', ...prev });
		game.refreshBest();
	}

	let wakeLock: WakeLockSentinel | null = null;

	async function applyKiosk() {
		document.documentElement.classList.toggle('kiosk', settings.kiosk);
		if (settings.kiosk && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
			try {
				wakeLock = await navigator.wakeLock.request('screen');
				wakeLock.addEventListener('release', () => (wakeLock = null));
			} catch {
				// Браузер не дав — ноутбук має не засинати за налаштуваннями живлення.
			}
		} else if (!settings.kiosk && wakeLock) {
			await wakeLock.release();
			wakeLock = null;
		}
	}

	onMount(() => {
		const q = new URLSearchParams(location.search).get('kiosk');
		if (q === '1' || q === '0') updateSettings({ ...settings, kiosk: q === '1' });
		applyKiosk();

		analytics.start();
		analytics.track('boot', {
			w: screen.width,
			h: screen.height,
			dpr: devicePixelRatio,
			touch: navigator.maxTouchPoints,
			ua: navigator.userAgent.slice(0, 200)
		});

		if (import.meta.env.DEV) Object.assign(window, { __game: game });

		const renderer = new Renderer(canvasEl);
		const ro = new ResizeObserver(([entry]) => {
			const { width, height } = entry.contentRect;
			renderer.resize(width, height, Math.min(devicePixelRatio || 1, 2));
		});
		ro.observe(stage);

		let frames = 0;
		let raf = 0;
		const loop = (now: number) => {
			renderer.draw(game.tick(now));
			frames++;
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);

		let lastHb = performance.now();
		const hb = setInterval(() => {
			const now = performance.now();
			analytics.track('hb', {
				fps: Math.round((frames * 1000) / (now - lastHb)),
				phase: game.phase,
				queued: analytics.queued,
				visible: document.visibilityState
			});
			frames = 0;
			lastHb = now;
		}, 5 * 60_000);

		const onError = (e: ErrorEvent) =>
			analytics.track('error', { msg: String(e.message).slice(0, 300), src: e.filename, line: e.lineno });
		const onRejection = (e: PromiseRejectionEvent) =>
			analytics.track('error', { msg: String(e.reason?.message ?? e.reason).slice(0, 300) });
		addEventListener('error', onError);
		addEventListener('unhandledrejection', onRejection);
		const onVisible = () => document.visibilityState === 'visible' && applyKiosk();
		document.addEventListener('visibilitychange', onVisible);

		// Нова версія приїхала через service worker — перезавантажуємось, коли ніхто не грає.
		let swPoll: ReturnType<typeof setInterval> | undefined;
		if ('serviceWorker' in navigator) {
			const hadController = !!navigator.serviceWorker.controller;
			navigator.serviceWorker.addEventListener('controllerchange', () => {
				if (!hadController) return;
				needsReload = true;
				if (game.phase === 'attract' && !adminOpen) location.reload();
			});
			swPoll = setInterval(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()), 10 * 60_000);
		}

		return () => {
			cancelAnimationFrame(raf);
			ro.disconnect();
			clearInterval(hb);
			clearInterval(swPoll);
			removeEventListener('error', onError);
			removeEventListener('unhandledrejection', onRejection);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});

	const fmtMs = (ms: number) => Math.round(Math.abs(ms));
</script>

<div class="viewport">
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="stage"
		bind:this={stage}
		onpointerdown={onDown}
		onpointerup={onUp}
		onpointercancel={cancelHold}
		onpointerleave={cancelHold}
		oncontextmenu={(e) => e.preventDefault()}
	>
		<canvas bind:this={canvasEl}></canvas>

		{#if game.phase === 'attract'}
			<div class="layer attract">
				<h1>{s.title}</h1>
				<p class="play">{s.play}</p>
				{#if game.best !== null}
					<p class="best">{s.best} <span class="num">{game.best.toFixed(1)}%</span></p>
				{/if}
				<div class="lang" role="group" aria-label="Language">
					{#each ['en', 'uk'] as const as l (l)}
						<button
							class:on={lang === l}
							onpointerdown={(e) => e.stopPropagation()}
							onpointerup={(e) => (e.stopPropagation(), setLang(l))}
						>
							{l === 'en' ? 'EN' : 'UA'}
						</button>
					{/each}
				</div>
			</div>
		{:else if game.phase === 'ready' || game.phase === 'flight'}
			<p class="layer hint">{s.hint}</p>
		{:else if game.judgement && game.verdict}
			{@const j = game.judgement}
			<div class="layer result">
				<div class="top">
					<p class="verdict" class:win={game.verdict === 'intercepted'}>{s.verdict[game.verdict]}</p>
					<p class="score num">{shown.current.toFixed(1)}<span class="pct">%</span></p>
				</div>
				<div class="bottom">
					{#if j.outcome === 'hit' && j.errMs !== null}
						<p>{fmtMs(j.errMs) === 0 ? s.exact : j.errMs > 0 ? s.late(fmtMs(j.errMs)) : s.early(fmtMs(j.errMs))}</p>
					{/if}
					{#if game.better !== null}
						<p>{s.better(game.better)}</p>
					{/if}
				</div>
				<p class="retry" class:on={game.canRetry}>{s.retry}</p>
			</div>
		{/if}
	</div>
	<p class="rotate">{s.rotate}</p>
</div>

{#if adminOpen}
	<Admin
		{settings}
		attempts={scores.length}
		best={game.best}
		{epoch}
		onChange={updateSettings}
		onReset={resetCounter}
		onCalibrate={() => (calibrating = true)}
		onClose={() => {
			adminOpen = false;
			analytics.track('admin', { action: 'close' });
		}}
	/>
{/if}

{#if calibrating}
	<Calibrate
		onDone={(ms) => {
			calibrating = false;
			if (ms !== null) updateSettings({ ...settings, latencyMs: ms });
		}}
	/>
{/if}

<style lang="scss">
	.viewport {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: #000;
		overflow: hidden;
		padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom)
			env(safe-area-inset-left);
	}

	.stage {
		position: relative;
		width: min(100vw, calc(100dvh * 16 / 9));
		aspect-ratio: 16 / 9;
		container-type: inline-size;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: pointer;
	}

	:global(html.kiosk) .stage,
	:global(html.kiosk) .stage * {
		cursor: none;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		display: block;
	}

	.layer {
		position: absolute;
		inset: 0;
		margin: 0;
		pointer-events: none;
		text-align: center;
		animation: appear 220ms var(--ease) both;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}

	.attract {
		h1 {
			position: absolute;
			top: 6.5%;
			left: 0;
			right: 0;
			margin: 0;
			font-size: 4.6cqw;
			font-weight: 700;
			font-stretch: 85%;
			line-height: 1;
			text-transform: uppercase;
			letter-spacing: 0.01em;
		}

		.play {
			position: absolute;
			bottom: 9%;
			left: 0;
			right: 0;
			margin: 0;
			font-size: max(2cqw, 13px);
			color: var(--accent);
			animation: breathe 1.6s var(--ease) infinite alternate;
		}

		.best {
			position: absolute;
			left: 3%;
			bottom: 4%;
			margin: 0;
			font-size: max(1.15cqw, 11px);
			color: var(--muted);

			.num {
				color: var(--text);
				display: inline-block;
				min-width: 6ch;
				text-align: left;
			}
		}
	}

	@keyframes breathe {
		from {
			opacity: 0.45;
		}
	}

	.lang {
		position: absolute;
		right: 3%;
		bottom: 3.2%;
		display: flex;
		gap: 0.5cqw;
		pointer-events: auto;

		button {
			min-width: 4.4cqw;
			padding: 0.55cqw 0.9cqw;
			font-size: max(1.15cqw, 11px);
			font-weight: 600;
			background: transparent;
			border: 1px solid var(--line);
			border-radius: 0.7cqw;
			color: var(--muted);
			cursor: pointer;
			transition:
				border-color var(--dur) var(--ease),
				color var(--dur) var(--ease),
				background var(--dur) var(--ease);

			&:hover {
				border-color: var(--line-hover);
			}

			&.on {
				background: var(--accent);
				border-color: var(--accent);
				color: var(--accent-ink);
			}
		}
	}

	.hint {
		top: auto;
		bottom: 8%;
		font-size: max(1.7cqw, 12px);
		color: var(--muted);
	}

	.result {
		.top {
			position: absolute;
			top: 3%;
			left: 0;
			right: 0;
		}

		.verdict {
			margin: 0;
			font-size: 2.6cqw;
			font-weight: 700;
			font-stretch: 85%;

			&.win {
				color: var(--accent);
			}
		}

		.score {
			margin: 0.2cqw 0 0;
			font-size: 8cqw;
			font-weight: 600;
			line-height: 1;
			letter-spacing: -0.03em;
			// Резерв під «100.0%», щоб число не стрибало, поки накручується.
			display: inline-block;
			min-width: 6ch;

			.pct {
				font-size: 0.5em;
				color: var(--muted);
				margin-left: 0.1em;
			}
		}

		.bottom {
			position: absolute;
			top: 76%;
			left: 0;
			right: 0;
			font-size: max(1.6cqw, 12px);
			color: var(--muted);

			p {
				margin: 0 0 0.5cqw;
			}
		}

		.retry {
			position: absolute;
			bottom: 5%;
			left: 0;
			right: 0;
			margin: 0;
			font-size: max(1.8cqw, 13px);
			color: var(--accent);
			opacity: 0;
			transition: opacity var(--dur) var(--ease);

			&.on {
				opacity: 1;
				animation: breathe 1.6s var(--ease) infinite alternate;
			}
		}
	}

	.rotate {
		display: none;
	}

	@media (orientation: portrait) and (max-width: 700px) {
		.viewport {
			align-content: center;
			gap: 16px;
		}

		.rotate {
			display: block;
			margin: 0;
			padding: 0 16px;
			font-size: 14px;
			color: var(--muted);
			text-align: center;
		}
	}
</style>
