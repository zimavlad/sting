import { describe, expect, it } from 'vitest';
import { SHAHED_LEN, STING_LEN, TARGET, TUNING } from './config';
import { betterThan, judge, makeRound, scoreFromDx, verdictOf, xAt } from './sim';

const fixed = (v: number) => () => v;

describe('makeRound', () => {
	it('Стінг приходить у контур рівно в tHit', () => {
		const r = makeRound(fixed(0.5), TUNING);
		expect(xAt(r.sting, STING_LEN, r.tHit)).toBeCloseTo(TARGET.x, 6);
	});

	it('Стінг зʼявляється після Шахеда і вилітає після tHit', () => {
		for (const v of [0, 0.3, 0.99]) {
			const r = makeRound(fixed(v), TUNING);
			expect(r.sting.t0).toBeGreaterThan(r.shahed.t0);
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
			const shahedTail = xAt(r.shahed, SHAHED_LEN, r.tHit) - SHAHED_LEN / 2;
			expect(shahedTail).toBeGreaterThan(TARGET.x + STING_LEN / 2 + 40);
		}
	});

	it('множник швидкості прискорює обидва дрони', () => {
		const r = makeRound(fixed(0.5), TUNING, 1.5);
		expect(r.shahed.speed).toBeCloseTo(TUNING.shahedSpeed * 1.5);
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
