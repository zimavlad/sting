import { describe, expect, it } from 'vitest';
import { LEVELS, SHAHED_LEN, STAGE, STING_LEN, TARGET, TUNING, type Level } from './config';
import { betterThan, judge, makeRound, scoreFromDx, verdictOf, xAt } from './sim';

const fixed = (v: number) => () => v;

/** Відтворюваний генератор: кожен виклик дає нове значення, тож раунди різні, а тест стабільний. */
function seeded(seed: number) {
	return () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed / 2 ** 32;
	};
}

const LEVEL_IDS: Level[] = [1, 2, 3];

/** Багато різних раундів рівня на всіх крайніх множниках швидкості зі стенду. */
function rounds(level: Level, n = 3000) {
	const rand = seeded(level * 101);
	return Array.from({ length: n }, (_, i) => makeRound(rand, LEVELS[level], [0.5, 1, 2][i % 3]));
}

describe('рівні', () => {
	it('рівень 1 не змінює гру: один Шахед стартує в нуль, Стінг останній', () => {
		for (const v of [0, 0.5, 0.99]) {
			const r = makeRound(fixed(v), LEVELS[1]);
			const gap = TUNING.gapMin + (TUNING.gapMax - TUNING.gapMin) * v;
			expect(r.shaheds).toHaveLength(1);
			expect(r.shaheds[0].t0).toBe(0);
			expect(r.ahead).toBe(1);
			expect(r.gap).toBeCloseTo(gap);
			expect(r.tHit).toBeCloseTo((TARGET.x + SHAHED_LEN) / TUNING.shahedSpeed + gap);
			expect(r.tEnd).toBeCloseTo(r.sting.t0 + (STAGE.w + 2 * STING_LEN) / r.sting.speed);
		}
	});

	it('рівень 1: Стінг завжди другий', () => {
		expect(new Set(rounds(1).map((r) => r.ahead))).toEqual(new Set([1]));
	});

	it('рівень 2: Стінг буває і першим, і другим', () => {
		const list = rounds(2);
		expect(new Set(list.map((r) => r.ahead))).toEqual(new Set([0, 1]));
		expect(list.every((r) => r.shaheds.length === 1)).toBe(true);
	});

	it('рівень 3: два Шахеди, Стінг на кожному з трьох місць', () => {
		const list = rounds(3);
		expect(new Set(list.map((r) => r.ahead))).toEqual(new Set([0, 1, 2]));
		expect(list.every((r) => r.shaheds.length === 2)).toBe(true);
	});

	it('рівень 3 швидший за перший на 20%', () => {
		const a = makeRound(fixed(0.5), LEVELS[1]);
		const b = makeRound(fixed(0.5), LEVELS[3]);
		expect(b.shaheds[0].speed).toBeCloseTo(a.shaheds[0].speed * 1.2);
		expect(b.sting.speed).toBeCloseTo(a.sting.speed * 1.2);
	});

	it('розкид швидкості Стінга на рівнях 2 і 3 ширший', () => {
		for (const level of [2, 3] as const) {
			const t = LEVELS[level];
			const base = t.stingSpeed * t.speed;
			expect(makeRound(fixed(0), t).sting.speed).toBeCloseTo(base * 0.7);
			expect(makeRound(fixed(0.999999), t).sting.speed).toBeCloseTo(base * 1.3, 0);
		}
	});

	it('старт рівнів 2 і 3 не завжди в ту саму мить', () => {
		for (const level of [2, 3] as const) {
			const firstOnScreen = rounds(level).map((r) => Math.min(r.sting.t0, ...r.shaheds.map((s) => s.t0)));
			expect(Math.min(...firstOnScreen)).toBeLessThan(0.05);
			expect(Math.max(...firstOnScreen)).toBeGreaterThan(0.25);
		}
	});

	it.each(LEVEL_IDS)('рівень %i: коли Стінг у контурі, жоден Шахед його не закриває', (level) => {
		for (const r of rounds(level)) {
			expect(xAt(r.sting, STING_LEN, r.tHit)).toBeCloseTo(TARGET.x, 6);
			for (const s of r.shaheds) {
				const x = xAt(s, SHAHED_LEN, r.tHit);
				const passed = x - SHAHED_LEN / 2 > TARGET.x + STING_LEN / 2 + 40;
				const behind = x + SHAHED_LEN / 2 < TARGET.x - STING_LEN / 2 - 40;
				expect(passed || behind).toBe(true);
			}
		}
	});

	it('Шахеди не налазять один на одного', () => {
		for (const r of rounds(3)) {
			const [a, b] = [...r.shaheds].sort((p, q) => p.t0 - q.t0);
			expect((b.t0 - a.t0) * a.speed).toBeGreaterThan(SHAHED_LEN);
		}
	});

	it('коли Стінг перший, він заходить у кадр раніше за Шахедів', () => {
		for (const level of [2, 3] as const) {
			for (const r of rounds(level).filter((x) => x.ahead === 0)) {
				expect(Math.min(...r.shaheds.map((s) => s.t0))).toBeGreaterThan(r.sting.t0);
				expect(r.gap).toBeNull();
			}
		}
	});

	it('раунд без дотику закінчується, коли пролетів останній у черзі', () => {
		for (const level of LEVEL_IDS) {
			for (const r of rounds(level, 600)) {
				const off = (s: { t0: number; speed: number }, len: number) => s.t0 + (STAGE.w + 2 * len) / s.speed;
				const lastOff = r.ahead < r.shaheds.length ? Math.max(...r.shaheds.map((s) => off(s, SHAHED_LEN))) : off(r.sting, STING_LEN);
				expect(r.tEnd).toBeCloseTo(lastOff);
				expect(r.tEnd).toBeGreaterThan(r.tHit);
			}
		}
	});
});

describe('makeRound', () => {
	it('Стінг приходить у контур рівно в tHit', () => {
		const r = makeRound(fixed(0.5), TUNING);
		expect(xAt(r.sting, STING_LEN, r.tHit)).toBeCloseTo(TARGET.x, 6);
	});

	it('Стінг зʼявляється після Шахеда і вилітає після tHit', () => {
		for (const v of [0, 0.3, 0.99]) {
			const r = makeRound(fixed(v), TUNING);
			expect(r.sting.t0).toBeGreaterThan(r.shaheds[0].t0);
			expect(r.tEnd).toBeGreaterThan(r.tHit);
		}
	});

	it('швидкість тримається в межах розкиду', () => {
		const lo = makeRound(fixed(0), TUNING).sting.speed;
		const hi = makeRound(fixed(1), TUNING).sting.speed;
		expect(lo).toBeCloseTo(TUNING.stingSpeed * (1 - TUNING.stingSpread));
		expect(hi).toBeCloseTo(TUNING.stingSpeed * (1 + TUNING.stingSpread));
	});

	it('коли Стінг у контурі, хвіст Шахеда вже за його носом', () => {
		for (const scale of [0.5, 1, 2]) {
			const r = makeRound(fixed(0), TUNING, scale);
			const shahedTail = xAt(r.shaheds[0], SHAHED_LEN, r.tHit) - SHAHED_LEN / 2;
			expect(shahedTail).toBeGreaterThan(TARGET.x + STING_LEN / 2 + 40);
		}
	});

	it('множник швидкості прискорює обидва дрони', () => {
		const r = makeRound(fixed(0.5), TUNING, 1.5);
		expect(r.shaheds[0].speed).toBeCloseTo(TUNING.shahedSpeed * 1.5);
		expect(r.sting.speed).toBeCloseTo(TUNING.stingSpeed * 1.5);
	});
});

describe('scoreFromDx', () => {
	it('100.0 лише без зсуву', () => {
		expect(scoreFromDx(0)).toBe(100);
		expect(scoreFromDx(0.5)).toBeLessThan(100);
	});

	it('симетричний і лінійний до довжини корпусу', () => {
		expect(scoreFromDx(STING_LEN / 2)).toBe(50);
		expect(scoreFromDx(-STING_LEN / 2)).toBe(50);
		expect(scoreFromDx(STING_LEN)).toBe(0);
		expect(scoreFromDx(STING_LEN * 3)).toBe(0);
	});

	it('одна цифра після коми', () => {
		const s = scoreFromDx(37);
		expect(Math.round(s * 10) / 10).toBe(s);
	});
});

describe('judge', () => {
	const r = makeRound(fixed(0.5), TUNING);

	it('точний дотик — 100%', () => {
		const j = judge(r, r.tHit);
		expect(j.outcome).toBe('hit');
		expect(j.score).toBe(100);
		expect(j.errMs).toBeCloseTo(0);
	});

	it('запізнення — плюс у мілісекундах і зсув праворуч', () => {
		const j = judge(r, r.tHit + 0.03);
		expect(j.errMs).toBeCloseTo(30);
		expect(j.dx).toBeCloseTo(r.sting.speed * 0.03);
		expect(j.score).toBe(scoreFromDx(r.sting.speed * 0.03));
	});

	it('дотик до появи Стінга — зарано, 0%', () => {
		const j = judge(r, r.sting.t0 - 0.2);
		expect(j.outcome).toBe('early');
		expect(j.score).toBe(0);
	});

	it('без дотику — пропуск', () => {
		expect(judge(r, null)).toEqual({ outcome: 'miss', score: 0, dx: null, errMs: null });
	});

	it('дотик, коли Стінг уже вилетів за екран, — запізно, а не промах', () => {
		const tOff = r.sting.t0 + (STAGE.w + 2 * STING_LEN) / r.sting.speed;
		const j = judge(r, tOff + 0.1);
		expect(j.outcome).toBe('miss');
		expect(j.score).toBe(0);
		expect(j.errMs).toBeGreaterThan(0);
		expect(verdictOf(j)).toBe('late');
	});

	it('дотик, поки хвіст Стінга ще на екрані, — звичайний результат', () => {
		const tOff = r.sting.t0 + (STAGE.w + 2 * STING_LEN) / r.sting.speed;
		expect(judge(r, tOff - STING_LEN / r.sting.speed - 0.01).outcome).toBe('hit');
	});
});

describe('verdictOf', () => {
	const hit = (score: number) => ({ outcome: 'hit' as const, score, dx: 0, errMs: 0 });
	it('межі вердиктів', () => {
		expect(verdictOf(hit(100))).toBe('intercepted');
		expect(verdictOf(hit(95))).toBe('intercepted');
		expect(verdictOf(hit(94.9))).toBe('close');
		expect(verdictOf(hit(80))).toBe('close');
		expect(verdictOf(hit(50))).toBe('near');
		expect(verdictOf(hit(49.9))).toBe('missed');
		expect(verdictOf({ outcome: 'early', score: 0, dx: -900, errMs: -400 })).toBe('early');
		expect(verdictOf({ outcome: 'miss', score: 0, dx: null, errMs: null })).toBe('late');
	});
});

describe('betterThan', () => {
	it('замало даних — null', () => {
		expect(betterThan([1, 2, 3], 50)).toBeNull();
	});

	it('частка строго гірших', () => {
		const prev = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
		expect(betterThan(prev, 55)).toBe(50);
		expect(betterThan(prev, 100)).toBe(90);
		expect(betterThan(prev, 5)).toBe(0);
	});
});
