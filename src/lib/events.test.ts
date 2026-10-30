import { describe, expect, it } from 'vitest';
import { MAX_BATCH, parseBatch } from './events';

const ok = { id: 'a1', t: 1, type: 'attempt', device: 'd1', epoch: 'e1', kiosk: true, v: '1', data: { score: 50 } };

describe('parseBatch', () => {
	it('пропускає правильні події й лишає тільки відомі поля', () => {
		const [e] = parseBatch({ events: [{ ...ok, extra: 'x' }] })!;
		expect(e).toEqual(ok);
	});

	it('відкидає криві події, але не весь пакет', () => {
		const out = parseBatch({
			events: [ok, { ...ok, type: 'hack' }, { ...ok, t: 'вчора' }, { ...ok, id: '' }, { ...ok, data: [1] }, null]
		});
		expect(out).toHaveLength(1);
	});

	it('не той формат або завеликий пакет — null', () => {
		expect(parseBatch({})).toBeNull();
		expect(parseBatch('events')).toBeNull();
		expect(parseBatch({ events: Array(MAX_BATCH + 1).fill(ok) })).toBeNull();
	});

	it('kiosk лише true, якщо так і передали', () => {
		const [e] = parseBatch({ events: [{ ...ok, kiosk: 'yes' }] })!;
		expect(e.kiosk).toBe(false);
	});

	it('ріже завеликі data', () => {
		expect(parseBatch({ events: [{ ...ok, data: { s: 'x'.repeat(5000) } }] })).toEqual([]);
	});
});
