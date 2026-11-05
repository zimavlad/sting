<script lang="ts">
	import { onMount } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { analytics } from '$lib/analytics.svelte';
	import { TIMING, type Level } from '$lib/game/config';
	import { Game } from '$lib/game/game.svelte';
	import { PRIZES, prizeFor } from '$lib/game/prizes';
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
		level: () => settings.level,
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
				level: settings.level,
				ahead: round.ahead,
				prize: prizeFor(j.score).id,
				stingSpeed: Math.round(round.sting.speed),
				gap: round.gap === null ? null : Math.round(round.gap * 1000) / 1000,
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
		const x = (e.clientX - r.left) / r.width;
		const y = (e.clientY - r.top) / r.height;
		// Портретний 86" заввишки майже 2 м, до верхнього кута можна не дістати, тож там працює і нижній.
		if (r.height > r.width) return x < 0.14 && (y < 0.07 || y > 0.93);
		return x < 0.08 && y < 0.12;
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
		// Спершу аналітика: події зі змін за адресою без неї йшли б без пристрою, і сервер їх відкине.
		analytics.start();

		const params = new URLSearchParams(location.search);
		const q = params.get('kiosk');
		if (q === '1' || q === '0') updateSettings({ ...settings, kiosk: q === '1' });
		const l = Number(params.get('level'));
		if (l === 1 || l === 2 || l === 3) updateSettings({ ...settings, level: l as Level });
		applyKiosk();

		if (params.get('admin') === '1') {
			adminOpen = true;
			analytics.track('admin', { action: 'open' });
			// Лише один раз: якщо лишити в адресі, автоперезавантаження кіоску знову відкриє панель поверх гри.
			params.delete('admin');
			const rest = params.toString();
			history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : ''));
		}

		// Щоб картинка мерчу зʼявлялась одразу разом із відсотком, а не за мить після нього.
		for (const p of PRIZES) new Image().src = p.image;

		analytics.track('boot', {
			w: screen.width,
			h: screen.height,
			dpr: devicePixelRatio,
			touch: navigator.maxTouchPoints,
			ua: navigator.userAgent.slice(0, 200)
		});
		// Запуск — одразу на сервер: так на /stats видно, що кіоск ожив.
		analytics.flush();

		const renderer = new Renderer(canvasEl);
		if (import.meta.env.DEV) Object.assign(window, { __game: game, __renderer: renderer });
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
			{@const prize = prizeFor(j.score)}
			<div class="layer result">
				<div class="top">
					<p class="verdict" class:win={game.verdict === 'intercepted'}>{s.verdict[game.verdict]}</p>
					<p class="score num">{shown.current.toFixed(1)}<span class="pct">%</span></p>
				</div>
				<div class="bottom">
					<div class="prize">
						<img src={prize.image} alt="" />
						<div>
							<p class="prize-label">{s.prize}</p>
							<p class="prize-name">{prize.name[lang]}</p>
						</div>
					</div>
					<div class="facts">
						{#if j.outcome === 'hit' && j.errMs !== null}
							<p>{fmtMs(j.errMs) === 0 ? s.exact : j.errMs > 0 ? s.late(fmtMs(j.errMs)) : s.early(fmtMs(j.errMs))}</p>
						{/if}
						{#if game.better !== null}
							<p>{s.better(game.better)}</p>
						{/if}
					</div>
					<p class="retry" class:on={game.canRetry}>{s.retry}</p>
				</div>
			</div>
		{/if}
	</div>
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
	// Розміри в cqw: 1cqw — це 1% ширини сцени, а в портреті вона майже вдвічі вужча.
	@mixin portrait {
		@media (orientation: portrait) {
			@content;
		}
	}

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

		@include portrait {
			width: min(100vw, calc(100dvh * 9 / 16));
			aspect-ratio: 9 / 16;
		}
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

			@include portrait {
				top: 7%;
				padding: 0 6cqw;
				font-size: 12cqw;
				line-height: 1.04;
				text-wrap: balance;
			}
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

			@include portrait {
				bottom: 13%;
				font-size: 5cqw;
			}
		}

		.best {
			position: absolute;
			left: 3%;
			bottom: 4%;
			margin: 0;
			font-size: max(1.15cqw, 11px);
			color: var(--muted);

			@include portrait {
				left: 5%;
				bottom: 3.4%;
				max-width: 44%;
				text-align: left;
				font-size: max(2.6cqw, 11px);
			}

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

		@include portrait {
			right: 5%;
			bottom: 2.6%;
			gap: 1.4cqw;
		}

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

			@include portrait {
				min-width: 13cqw;
				min-height: max(7.5cqw, 44px);
				padding: 0 2cqw;
				font-size: max(2.8cqw, 12px);
				border-radius: 1.6cqw;
			}

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

		@include portrait {
			bottom: 5%;
			padding: 0 8cqw;
			font-size: max(3.6cqw, 13px);
		}
	}

	.result {
		.top {
			position: absolute;
			top: 3%;
			left: 0;
			right: 0;

			@include portrait {
				top: 13%;
			}
		}

		.verdict {
			margin: 0;
			font-size: 2.6cqw;
			font-weight: 700;
			font-stretch: 85%;

			@include portrait {
				font-size: 7.5cqw;
			}

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

			@include portrait {
				margin-top: 1cqw;
				font-size: 19cqw;
			}

			.pct {
				font-size: 0.5em;
				color: var(--muted);
				margin-left: 0.1em;
			}
		}

		// Під зупиненим Стінгом: мерч, цифри, повтор.
		.bottom {
			position: absolute;
			bottom: 3%;
			left: 0;
			right: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			gap: 0.8cqw;

			@include portrait {
				top: 61%;
				gap: 3cqw;
			}
		}

		.prize {
			display: flex;
			align-items: center;
			gap: 1.2cqw;
			padding: 0.5cqw 2.4cqw 0.5cqw 0.8cqw;
			background: var(--surface);
			border: 1px solid var(--line);
			border-radius: 0.9cqw;
			text-align: left;
			animation: rise 240ms var(--ease) both;

			@include portrait {
				width: 84cqw;
				gap: 4cqw;
				padding: 2cqw 4cqw 2cqw 2cqw;
				border-radius: 2.4cqw;
			}

			img {
				display: block;
				width: 6.4cqw;
				height: 6.4cqw;
				object-fit: contain;

				@include portrait {
					width: 27cqw;
					height: 27cqw;
				}
			}
		}

		.prize-label {
			margin: 0;
			font-size: max(1.1cqw, 11px);
			color: var(--muted);

			@include portrait {
				font-size: max(3.4cqw, 12px);
			}
		}

		.prize-name {
			margin: 0.15cqw 0 0;
			font-size: 2.4cqw;
			font-weight: 700;
			font-stretch: 85%;
			line-height: 1.05;
			color: var(--accent);

			@include portrait {
				margin-top: 0.8cqw;
				font-size: 9cqw;
			}
		}

		.facts {
			font-size: max(1.5cqw, 12px);
			color: var(--muted);

			@include portrait {
				font-size: max(3.4cqw, 12px);
			}

			p {
				margin: 0 0 0.3cqw;

				@include portrait {
					margin-bottom: 1cqw;
				}
			}
		}

		.retry {
			margin: 0;
			font-size: max(1.8cqw, 13px);
			color: var(--accent);
			opacity: 0;
			transition: opacity var(--dur) var(--ease);

			@include portrait {
				margin-top: auto;
				font-size: 4.6cqw;
			}

			&.on {
				opacity: 1;
				animation: breathe 1.6s var(--ease) infinite alternate;
			}
		}
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(1cqw);
		}
	}
</style>
