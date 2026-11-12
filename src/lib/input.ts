// Кнопка гравця замість дотику: на стенді це може бути сенсорна або звичайна кнопка.
// Ноутбук бачить таку або як клавіатуру (будь-яка клавіша), або як геймпад (аркадні кнопки).

interface KeyLike {
	key: string;
	repeat: boolean;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
}

/** Службові клавіші лишаємо браузеру й системі: гра на них не реагує. */
const RESERVED = /^(Shift|Control|Alt|AltGraph|Meta|OS|CapsLock|NumLock|ScrollLock|Tab|Escape|ContextMenu|F\d+|Dead|Unidentified|Audio.*|Media.*|Brightness.*|Power.*|Launch.*)$/;

/** Чи це натискання кнопки гравця: будь-яка звичайна клавіша, без автоповтору й комбінацій. */
export function isActionKey(e: KeyLike): boolean {
	return !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey && !RESERVED.test(e.key);
}

interface PadLike {
	index: number;
	timestamp: number;
	buttons: readonly { pressed: boolean }[];
}

/** Наскільки час із геймпада може відставати від моменту опитування, щоб йому вірити, мс. */
const PAD_STAMP_MAX_AGE = 100;

/**
 * Геймпад не шле подій, його опитують щокадру. Тут — що змінилося з минулого опитування:
 * down — час нового натискання будь-якої кнопки, up — якусь кнопку відпустили.
 */
export class Pads {
	private held = new Set<string>();

	poll(pads: readonly (PadLike | null)[], now: number): { down: number | null; up: boolean } {
		const pressed = new Set<string>();
		let down: number | null = null;
		for (const pad of pads) {
			if (!pad) continue;
			pad.buttons.forEach((b, i) => {
				if (!b.pressed) return;
				const id = `${pad.index}:${i}`;
				pressed.add(id);
				if (this.held.has(id)) return;
				// Час із геймпада точніший за кадр, але драйвери бувають різні: беремо лише правдоподібний.
				const t = pad.timestamp;
				const stamp = t > now - PAD_STAMP_MAX_AGE && t <= now ? t : now;
				down = down === null ? stamp : Math.min(down, stamp);
			});
		}
		let up = false;
		for (const id of this.held) if (!pressed.has(id)) up = true;
		this.held = pressed;
		return { down, up };
	}
}

/** Геймпади браузера; у старих чи заблокованих оточеннях їх може не бути. */
export function readPads(): readonly (Gamepad | null)[] {
	try {
		return navigator.getGamepads?.() ?? [];
	} catch {
		return [];
	}
}
