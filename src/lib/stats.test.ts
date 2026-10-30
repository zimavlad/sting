import { describe, expect, it } from 'vitest';
import type { StingEvent } from './events';
import { aggregate, devices, epochs, filterEvents, hourKey } from './stats';

let n = 0;
const ev = (type: StingEvent['type'], data?: Record<string, unknown>, over: Partial<StingEvent> = {}): StingEvent => ({
	id: `e${n++}`,
	t: Date.UTC(2026, 10, 14, 10, 0, 0) + n * 1000,
	type,
	device: 'kiosk1',
	epoch: 'expo',
	kiosk: true,
	v: '1',
	...(data ? { data } : {}),
	...over
});

const attempt = (score: number, outcome = 'hit', errMs: number | null = 0) => ev('attempt', { outcome, score, errMs });

describe('aggregate', () => {
	const events = [
		ev('start', { lang: 'en' }),
		attempt(97.5, 'hit', 8),
		attempt(41, 'hit', -70),
		ev('end', { attempts: 2, ms: 20_000 }),
		ev('start', { lang: 'uk' }),
		attempt(0, 'early', -900),
		ev('end', { attempts: 1, ms: 10_000 }),
		ev('start', { lang: 'en' }),
		attempt(0, 'miss', null),
		ev('end', { attempts: 1, ms: 12_000 })
	];
	const s = aggregate(events);

	it('рахує спроби й сесії', () => {
		expect(s.attempts).toBe(4);
		expect(s.sessions).toBe(3);
		expect(s.hits).toBe(2);
		expect(s.early).toBe(1);
		expect(s.late).toBe(1);
		expect(s.intercepted).toBe(1);
	});

	it('середнє, медіана й рекорд з нулями пропусків', () => {
		expect(s.avg).toBe(34.6);
		expect(s.median).toBe(20.5);
		expect(s.best).toBe(97.5);
	});

	it('розподіл по 10%: 100 і 97.5 — у верхньому кошику', () => {
		expect(s.dist[0]).toBe(2);
		expect(s.dist[4]).toBe(1);
		expect(s.dist[9]).toBe(1);
		expect(aggregate([attempt(100)]).dist[9]).toBe(1);
	});

	it('помилка в мс лише серед влучань', () => {
		expect(s.avgErrMs).toBe(-31);
		expect(s.lateShare).toBe(0.5);
		expect(s.errDist.reduce((a, b) => a + b)).toBe(2);
	});

	it('крайні кошики помилки збирають викиди', () => {
		const d = aggregate([attempt(10, 'hit', -500), attempt(10, 'hit', 500)]).errDist;
		expect(d[0]).toBe(1);
		expect(d[d.length - 1]).toBe(1);
	});

	it('повторні спроби, тривалість і мови', () => {
		expect(s.perSession).toBe(1.3);
		expect(s.retryShare).toBeCloseTo(1 / 3);
		expect(s.avgSessionSec).toBe(14);
		expect(s.lang).toEqual({ en: 2, uk: 1 });
	});

	it('порожньо — без NaN', () => {
		const e = aggregate([]);
		expect(e.avg).toBeNull();
		expect(e.median).toBeNull();
		expect(e.best).toBeNull();
		expect(e.retryShare).toBeNull();
	});
});

describe('фільтри й довідники', () => {
	const events = [
		attempt(50),
		ev('attempt', { outcome: 'hit', score: 90 }, { kiosk: false, device: 'phone' }),
		ev('attempt', { outcome: 'hit', score: 70 }, { epoch: 'test' })
	];

	it('лише кіоск і лише захід', () => {
		expect(filterEvents(events, { epoch: null, kioskOnly: true })).toHaveLength(2);
		expect(filterEvents(events, { epoch: 'expo', kioskOnly: false })).toHaveLength(2);
		expect(filterEvents(events, { epoch: 'expo', kioskOnly: true })).toHaveLength(1);
	});

	it('заходи й пристрої', () => {
		expect(epochs(events).map((e) => [e.epoch, e.attempts])).toEqual([
			['test', 1],
			['expo', 2]
		]);
		expect(devices(events).map((d) => d.device).sort()).toEqual(['kiosk1', 'phone']);
	});

	it('година в київському часі', () => {
		expect(hourKey(Date.UTC(2026, 10, 14, 10, 30))).toBe('2026-11-14 12');
	});
});
