import { describe, expect, it } from 'vitest';
import { PRIZES, prizeFor } from './prizes';

describe('prizeFor', () => {
	it('межі порогів', () => {
		expect(prizeFor(100).id).toBe('tote');
		expect(prizeFor(95).id).toBe('tote');
		expect(prizeFor(94.9).id).toBe('carabiner');
		expect(prizeFor(80).id).toBe('carabiner');
		expect(prizeFor(79.9).id).toBe('keychain');
		expect(prizeFor(60).id).toBe('keychain');
		expect(prizeFor(59.9).id).toBe('pen');
		expect(prizeFor(30).id).toBe('pen');
		expect(prizeFor(29.9).id).toBe('candy');
	});

	it('0% теж отримує мерч: зарано, запізно й промах ідуть із цукерками', () => {
		expect(prizeFor(0).id).toBe('candy');
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
