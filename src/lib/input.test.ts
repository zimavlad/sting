import { describe, expect, it } from 'vitest';
import { isActionKey, Pads } from './input';

const key = (key: string, extra: Partial<{ repeat: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({
	key,
	repeat: false,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	...extra
});

describe('isActionKey', () => {
	it('будь-яка звичайна клавіша — це кнопка гравця', () => {
		for (const k of [' ', 'Enter', 'a', '1', 'ArrowUp', 'PageDown', 'b']) expect(isActionKey(key(k))).toBe(true);
	});

	it('утримання клавіші не дає нових натискань', () => {
		expect(isActionKey(key(' ', { repeat: true }))).toBe(false);
	});

	it('службові клавіші й комбінації лишаються браузеру', () => {
		for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'Tab', 'Escape', 'F5', 'F11', 'CapsLock']) {
			expect(isActionKey(key(k))).toBe(false);
		}
		expect(isActionKey(key('r', { ctrlKey: true }))).toBe(false);
		expect(isActionKey(key('r', { metaKey: true }))).toBe(false);
		expect(isActionKey(key('ArrowLeft', { altKey: true }))).toBe(false);
	});
});

describe('Pads', () => {
	const pad = (pressed: boolean[], timestamp = 0, index = 0) => ({ index, timestamp, buttons: pressed.map((p) => ({ pressed: p })) });

	it('натискання помічає один раз, а не щокадру', () => {
		const pads = new Pads();
		expect(pads.poll([pad([false, false])], 100)).toEqual({ down: null, up: false });
		expect(pads.poll([pad([false, true], 112)], 116).down).toBe(112);
		expect(pads.poll([pad([false, true], 112)], 132)).toEqual({ down: null, up: false });
	});

	it('відпускання помічає теж один раз', () => {
		const pads = new Pads();
		pads.poll([pad([true])], 100);
		expect(pads.poll([pad([false])], 116)).toEqual({ down: null, up: true });
		expect(pads.poll([pad([false])], 132)).toEqual({ down: null, up: false });
	});

	it('будь-яка кнопка будь-якого геймпада годиться, порожні гнізда пропускає', () => {
		const pads = new Pads();
		expect(pads.poll([null, pad([false, false, true], 50, 1)], 60).down).toBe(50);
	});

	it('час натискання бере з геймпада, лише якщо він правдоподібний', () => {
		const pads = new Pads();
		// Деякі драйвери віддають 0 або час в іншій шкалі — тоді беремо момент опитування.
		expect(pads.poll([pad([true], 0)], 500).down).toBe(500);
		pads.poll([pad([false], 0)], 516);
		expect(pads.poll([pad([true], 9000)], 532).down).toBe(532);
	});

	it('геймпад відʼєднали з натиснутою кнопкою — вважаємо відпущеною', () => {
		const pads = new Pads();
		pads.poll([pad([true])], 100);
		expect(pads.poll([null], 116)).toEqual({ down: null, up: true });
	});
});
