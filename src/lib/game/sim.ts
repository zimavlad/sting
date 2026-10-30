import { PERCENTILE_MIN, SHAHED_LEN, STAGE, STING_LEN, TARGET, TIERS, type Tuning } from './config';

/** Тіло летить зліва направо: центр у x = -len у момент t0, далі рівномірно. */
export interface Body {
	t0: number;
	speed: number;
}

export interface Round {
	shahed: Body;
	sting: Body;
	/** Секунди від старту польоту, коли центр Стінга точно в контурі. */
	tHit: number;
	/** Стінг повністю вилетів праворуч — без дотику спроба пропущена. */
	tEnd: number;
	gap: number;
}

export type Outcome = 'hit' | 'early' | 'miss';

export interface Judgement {
	outcome: Outcome;
	/** 0–100 з однією цифрою після коми. */
	score: number;
	/** Зсув центру Стінга від контуру, px сцени; плюс — проскочив далі. */
	dx: number | null;
	/** Плюс — запізно, мінус — зарано. */
	errMs: number | null;
}

export type Verdict = 'intercepted' | 'close' | 'near' | 'missed' | 'early' | 'late';

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function xAt(body: Body, len: number, t: number): number {
	return -len + body.speed * (t - body.t0);
}

export function makeRound(rand: () => number, tuning: Tuning, speedScale = 1): Round {
	const shahed = { t0: 0, speed: tuning.shahedSpeed * speedScale };
	const tShahedAtTarget = (TARGET.x + SHAHED_LEN) / shahed.speed;
	const gap = lerp(tuning.gapMin, tuning.gapMax, rand());
	const speed = tuning.stingSpeed * speedScale * (1 + tuning.stingSpread * (rand() * 2 - 1));
	const tHit = tShahedAtTarget + gap;
	const t0 = tHit - (TARGET.x + STING_LEN) / speed;
	const tEnd = t0 + (STAGE.w + 2 * STING_LEN) / speed;
	return { shahed, sting: { t0, speed }, tHit, tEnd, gap };
}

export function scoreFromDx(dx: number): number {
	// Вниз, а не до найближчого: 100.0% — лише за ідеального влучання.
	return Math.floor(1000 * Math.max(0, 1 - Math.abs(dx) / STING_LEN)) / 10;
}

/** tTap — секунди від старту польоту з уже врахованою затримкою сенсора; null — дотику не було. */
export function judge(round: Round, tTap: number | null): Judgement {
	if (tTap === null) return { outcome: 'miss', score: 0, dx: null, errMs: null };
	const dx = xAt(round.sting, STING_LEN, tTap) - TARGET.x;
	const errMs = (tTap - round.tHit) * 1000;
	// Стінг ще не зʼявився на екрані — тапнули на Шахеда або навмання.
	if (TARGET.x + dx + STING_LEN / 2 < 0) return { outcome: 'early', score: 0, dx, errMs };
	return { outcome: 'hit', score: scoreFromDx(dx), dx, errMs };
}

export function verdictOf(j: Judgement): Verdict {
	if (j.outcome === 'early') return 'early';
	if (j.outcome === 'miss') return 'late';
	if (j.score >= TIERS.intercepted) return 'intercepted';
	if (j.score >= TIERS.close) return 'close';
	if (j.score >= TIERS.near) return 'near';
	return 'missed';
}

/** Частка попередніх результатів, гірших за цей, у відсотках; null — замало даних. */
export function betterThan(previous: readonly number[], score: number): number | null {
	if (previous.length < PERCENTILE_MIN) return null;
	const worse = previous.reduce((n, s) => n + (s < score ? 1 : 0), 0);
	return Math.round((100 * worse) / previous.length);
}
