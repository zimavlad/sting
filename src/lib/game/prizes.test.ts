import { describe, expect, it } from 'vitest';
import { PRIZES, prizeFor } from './prizes';
import { scoreFromDx } from './sim';

describe('prizeFor', () => {
	it('межі порогів: футболка лише за 100%, брелок від 50%, решта — стікери', () => {
		expect(prizeFor(100).id).toBe('tshirt');
		expect(prizeFor(99.9).id).toBe('keychain');
		expect(prizeFor(50).id).toBe('keychain');
		expect(prizeFor(49.9).id).toBe('stickers');
	});

	it('0% теж отримує мерч: зарано, запізно й промах ідуть зі стікерами', () => {
		expect(prizeFor(0).id).toBe('stickers');
	});

	it('призів рівно три, як погодив замовник', () => {
		expect(PRIZES.map((p) => p.id)).toEqual(['tshirt', 'keychain', 'stickers']);
	});

	it('футболку дає те, що гравець бачить як 100.0%, і не дає 99.9%', () => {
		expect(prizeFor(scoreFromDx(0)).id).toBe('tshirt');
		expect(prizeFor(scoreFromDx(0.5)).id).toBe('keychain');
	});

	it('список іде від дорогого до дешевого, інакше пошук дасть не той приз', () => {
		const mins = PRIZES.map((p) => p.min);
		expect(mins).toEqual([...mins].sort((a, b) => b - a));
		expect(mins.at(-1)).toBe(0);
	});

	it('у кожного призу є назва обома мовами й картинка', () => {
		for (const p of PRIZES) {
			expect(p.name.en).toBeTruthy();
			expect(p.name.uk).toBeTruthy();
			expect(p.image).toMatch(/^\/merch\//);
		}
	});
});
