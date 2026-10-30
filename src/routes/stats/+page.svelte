<script lang="ts">
	import Bars from '$lib/components/Bars.svelte';
	import { ERR_EDGES, TIME_ZONE } from '$lib/stats';

	let { data } = $props();
	const s = $derived(data.stats);

	const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
	const one = (v: number | null, unit = '') => (v === null ? '—' : `${v.toFixed(1)}${unit}`);
	const dt = (t: number) =>
		new Intl.DateTimeFormat('uk-UA', {
			timeZone: TIME_ZONE,
			day: '2-digit',
			month: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		}).format(t);

	const share = (n: number) => (s.attempts ? ` · ${Math.round((100 * n) / s.attempts)}%` : '');

	const tiles = $derived([
		{ label: 'Спроб', value: String(s.attempts) },
		{ label: 'Гравців', value: String(s.sessions), note: 'сесій від екрана очікування' },
		{ label: 'Середній результат', value: one(s.avg, '%') },
		{ label: 'Медіана', value: one(s.median, '%') },
		{ label: 'Рекорд', value: one(s.best, '%') },
		{ label: 'Перехоплено', value: `${s.intercepted}${share(s.intercepted)}`, note: '95% і вище' },
		{ label: 'Зарано', value: `${s.early}${share(s.early)}`, note: 'тапнули до появи Стінга' },
		{ label: 'Запізно', value: `${s.late}${share(s.late)}`, note: 'Стінг пролетів без дотику' },
		{ label: 'Спроб на гравця', value: one(s.perSession) },
		{ label: 'Грають ще раз', value: pct(s.retryShare) },
		{ label: 'Сесія', value: one(s.avgSessionSec, ' с'), note: 'від старту до повернення в очікування' },
		{ label: 'Мова', value: `EN ${s.lang.en} · UA ${s.lang.uk}` }
	]);

	const distBars = $derived(
		s.dist.map((v, i) => ({
			label: `${i * 10}`,
			value: v,
			tip: `${i * 10}–${i === 9 ? 100 : i * 10 + 9.9}% — ${v} спроб`
		}))
	);

	const errBars = $derived(
		s.errDist.map((v, i) => {
			const lo = ERR_EDGES[i];
			const hi = ERR_EDGES[i + 1];
			const range = i === 0 ? `раніше ${hi} мс` : i === s.errDist.length - 1 ? `пізніше +${lo} мс` : `${lo}…${hi} мс`;
			return { label: lo > 0 ? `+${lo}` : `${lo}`, value: v, tip: `${range} — ${v}` };
		})
	);

	const hourBars = $derived(
		s.byHour.map((h) => ({ label: h.hour.slice(11), value: h.attempts, tip: `${h.hour.slice(5)}:00 — ${h.attempts} спроб` }))
	);

	const link = (over: Record<string, string>) => {
		const p = new URLSearchParams({ scope: data.scope, epoch: data.epoch ?? 'all', ...over });
		return `?${p}`;
	};
</script>

<svelte:head>
	<title>Статистика · Sting</title>
</svelte:head>

<main>
	<header>
		<div>
			<h1>Статистика гри</h1>
			<p class="sub">
				{#if s.first && s.last}
					<span class="num">{dt(s.first)}</span> — <span class="num">{dt(s.last)}</span>, київський час
				{:else}
					Подій ще нема
				{/if}
			</p>
		</div>
		<a class="btn" href="/stats/export" download>Сирі події</a>
	</header>

	<nav class="filters" aria-label="Фільтри">
		<div class="seg">
			<a href={link({ scope: 'kiosk' })} class:on={data.scope === 'kiosk'}>Лише стенд</a>
			<a href={link({ scope: 'all' })} class:on={data.scope === 'all'}>Усі пристрої</a>
		</div>
		<div class="seg wrap">
			<a href={link({ epoch: 'all' })} class:on={data.epoch === null}>Усі заходи</a>
			{#each data.epochs as e (e.epoch)}
				<a href={link({ epoch: e.epoch })} class:on={data.epoch === e.epoch}>
					<span>з</span><span class="num">{e.epoch}</span><span class="num count">{e.attempts}</span>
				</a>
			{/each}
		</div>
		{#if !data.hasKiosk}
			<p class="note">Подій зі стенду ще нема — показую всі пристрої. Стенд позначається в налаштуваннях гри.</p>
		{/if}
	</nav>

	<section class="tiles">
		{#each tiles as t (t.label)}
			<div class="tile">
				<p class="label">{t.label}</p>
				<p class="value num">{t.value}</p>
				{#if t.note}<p class="note">{t.note}</p>{/if}
			</div>
		{/each}
	</section>

	<section class="charts">
		<div class="card">
			<h2>Результати</h2>
			<p class="note">Скільки спроб у кожному десятку відсотків</p>
			<Bars bars={distBars} />
		</div>
		<div class="card">
			<h2>Помилка в мілісекундах</h2>
			<p class="note">
				Ліворуч від лінії — зарано, праворуч — запізно. Середня:
				<span class="num">{s.avgErrMs === null ? '—' : `${s.avgErrMs > 0 ? '+' : ''}${s.avgErrMs} мс`}</span>,
				запізнюються <span class="num">{pct(s.lateShare)}</span>
			</p>
			<Bars bars={errBars} zeroAfter={5} every={2} />
		</div>
		<div class="card wide">
			<h2>Спроби по годинах</h2>
			{#if hourBars.length}
				<Bars bars={hourBars} every={Math.max(1, Math.ceil(hourBars.length / 12))} />
			{:else}
				<p class="note">Ще нема спроб</p>
			{/if}
		</div>
	</section>

	<section class="card">
		<h2>Пристрої</h2>
		<div class="devices">
			{#each data.devices as d (d.device)}
				<div class="device">
					<p class="name num">{d.device}{#if d.kiosk}<span class="badge">стенд</span>{/if}</p>
					<p><span class="k">Останній сигнал</span> <span class="num">{dt(d.lastSeen)}</span></p>
					<p><span class="k">Версія</span> <span class="num">{d.version}</span></p>
					<p><span class="k">FPS</span> <span class="num">{d.fps ?? '—'}</span></p>
					<p><span class="k">У черзі</span> <span class="num">{d.queued ?? '—'}</span></p>
					<p><span class="k">Запусків</span> <span class="num">{d.boots}</span></p>
				</div>
			{:else}
				<p class="note">Жоден пристрій ще не зʼявлявся</p>
			{/each}
		</div>
	</section>

	{#if data.errors.length}
		<section class="card">
			<h2>Помилки</h2>
			<ul class="errors">
				{#each data.errors as e, i (i)}
					<li><span class="num">{dt(e.t)} · {e.device}</span> {e.msg}</li>
				{/each}
			</ul>
		</section>
	{/if}
</main>

<style lang="scss">
	main {
		max-width: 1120px;
		margin: 0 auto;
		padding: 32px max(16px, env(safe-area-inset-right)) 64px max(16px, env(safe-area-inset-left));
		display: grid;
		gap: 16px;
	}

	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 16px;

		h1 {
			margin: 0;
			font-size: 28px;
			font-weight: 700;
			font-stretch: 85%;
		}
	}

	.sub,
	.note {
		margin: 4px 0 0;
		font-size: 13px;
		color: var(--muted);
		line-height: 1.45;
	}

	.btn,
	.seg a {
		display: inline-flex;
		align-items: center;
		min-height: 40px;
		padding: 0 14px;
		border: 1px solid var(--line);
		border-radius: 10px;
		color: var(--text);
		text-decoration: none;
		font-size: 14px;
		white-space: nowrap;
		transition:
			border-color var(--dur) var(--ease),
			background var(--dur) var(--ease);

		&:hover {
			border-color: var(--line-hover);
		}
	}

	.filters {
		display: grid;
		gap: 8px;
	}

	.seg {
		display: flex;
		gap: 6px;
		flex-wrap: wrap;

		a {
			gap: 6px;
		}

		.count {
			opacity: 0.6;
		}

		a.on {
			background: var(--accent);
			border-color: var(--accent);
			color: var(--accent-ink);
		}
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 160px), 1fr));
		gap: 8px;

		@media (max-width: 480px) {
			grid-template-columns: 1fr 1fr;
		}
	}

	.tile,
	.card {
		padding: 16px;
		background: var(--surface);
		border: 1px solid var(--line);
		border-radius: 14px;
		transition: border-color var(--dur) var(--ease);
		min-width: 0;

		&:hover {
			border-color: var(--line-hover);
		}
	}

	.tile {
		.label {
			margin: 0;
			font-size: 13px;
			color: var(--muted);
		}

		.value {
			margin: 8px 0 0;
			font-size: 22px;
			font-weight: 500;
			letter-spacing: -0.02em;
			overflow-wrap: anywhere;
		}

		.note {
			font-size: 12px;
		}
	}

	.charts {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;

		.wide {
			grid-column: 1 / -1;
		}

		@media (max-width: 760px) {
			grid-template-columns: 1fr;
		}
	}

	.card {
		h2 {
			margin: 0;
			font-size: 16px;
			font-weight: 600;
		}

		:global(.chart) {
			margin-top: 24px;
		}
	}

	.devices {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
		gap: 8px;
		margin-top: 12px;
	}

	.device {
		padding: 12px;
		border: 1px solid var(--line);
		border-radius: 10px;

		p {
			margin: 0 0 4px;
			font-size: 13px;
			display: flex;
			justify-content: space-between;
			gap: 8px;
		}

		.name {
			font-size: 14px;
			margin-bottom: 8px;
			justify-content: flex-start;
			align-items: center;
		}

		.k {
			color: var(--muted);
		}
	}

	.badge {
		padding: 2px 8px;
		border: 1px solid var(--accent);
		border-radius: 999px;
		font-family: var(--font);
		font-size: 11px;
	}

	.errors {
		margin: 12px 0 0;
		padding: 0;
		list-style: none;
		font-size: 13px;

		li {
			padding: 8px 0;
			border-top: 1px solid var(--line);
			overflow-wrap: anywhere;
		}

		.num {
			color: var(--muted);
			margin-right: 8px;
		}
	}
</style>
