import { PERCENTILE_MIN, QUEUE, SHAHED_LEN, STAGE, STING_LEN, TARGET, TIERS, type Tuning } from './config';

/** Тіло летить уздовж осі x сцени: центр у x = -len у момент t0, далі рівномірно. */
export interface Body {
	t0: number;
	speed: number;
}

export interface Round {
	shaheds: Body[];
	sting: Body;
	/** Секунди від старту польоту, коли центр Стінга точно в контурі. */
	tHit: number;
	/** Останній у черзі повністю вилетів за екран — без дотику спроба пропущена. */
	tEnd: number;
	/** Скільки Шахедів летить перед Стінгом; 0 — Стінг перший. */
	ahead: number;
	/** Секунди між Шахедом попереду і Стінгом у контурі; null — попереду нікого. */
	gap: number | null;
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
	const scale = speedScale * tuning.speed;
	// Множник швидкості стискає весь час, тож відстані між дронами від нього не залежать.
	const pick = (lo: number, hi: number) => lerp(lo, hi, rand()) / scale;

	const shahedSpeed = tuning.shahedSpeed * scale;
	const shahedToTarget = (TARGET.x + SHAHED_LEN) / shahedSpeed;
	const gap = pick(tuning.gapMin, tuning.gapMax);
	const speed = tuning.stingSpeed * scale * (1 + tuning.stingSpread * (rand() * 2 - 1));
	const stingToTarget = (TARGET.x + STING_LEN) / speed;
	const ahead = tuning.anyOrder ? Math.min(tuning.shaheds, Math.floor(rand() * (tuning.shaheds + 1))) : tuning.shaheds;

	const starts: number[] = [];
	let next = pick(0, tuning.leadMax);
	for (let i = 0; i < ahead; i++) {
		if (i > 0) next += pick(QUEUE.spacingMin, QUEUE.spacingMax);
		starts.push(next);
	}
	const t0 = ahead > 0 ? next + shahedToTarget + gap - stingToTarget : next;

	// Хто летить за Стінгом, той заходить у кадр уже після нього.
	next = t0 + pick(QUEUE.trailMin, QUEUE.trailMax);
	for (let i = ahead; i < tuning.shaheds; i++) {
		starts.push(next);
		next += pick(QUEUE.spacingMin, QUEUE.spacingMax);
	}

	const stingLast = ahead === tuning.shaheds;
	const tEnd = stingLast
		? t0 + (STAGE.w + 2 * STING_LEN) / speed
		: starts[starts.length - 1] + (STAGE.w + 2 * SHAHED_LEN) / shahedSpeed;

	return {
		shaheds: starts.map((s) => ({ t0: s, speed: shahedSpeed })),
		sting: { t0, speed },
		tHit: t0 + stingToTarget,
		tEnd,
		ahead,
		gap: ahead > 0 ? gap : null
	};
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
	// Стінг уже за екраном: тапнули на Шахед, який летів за ним.
	if (TARGET.x + dx - STING_LEN / 2 > STAGE.w) return { outcome: 'miss', score: 0, dx, errMs };
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
