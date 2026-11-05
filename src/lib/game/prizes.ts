import type { Lang } from '../i18n';

export interface Prize {
	id: string;
	/** Найменший результат у відсотках, за який дається цей мерч. */
	min: number;
	/** Шлях від кореня сайту: файл лежить у static/merch. */
	image: string;
	name: Record<Lang, string>;
}

/**
 * Мерч за результат, від дорогого до дешевого. Пороги спільні для всіх рівнів, тож
 * складніший рівень сам зменшує видачу дорогого. Картинки поки заглушки: коли мерч
 * погодять, покласти фото в static/merch і змінити тут image (підійде png, webp чи svg).
 */
export const PRIZES: readonly Prize[] = [
	{ id: 'tote', min: 95, image: '/merch/tote.svg', name: { en: 'Tote bag', uk: 'Шопер' } },
	{ id: 'carabiner', min: 80, image: '/merch/carabiner.svg', name: { en: 'Carabiner', uk: 'Карабін' } },
	{ id: 'keychain', min: 60, image: '/merch/keychain.svg', name: { en: 'Keychain', uk: 'Брелок' } },
	{ id: 'pen', min: 30, image: '/merch/pen.svg', name: { en: 'Pen', uk: 'Ручка' } },
	{ id: 'candy', min: 0, image: '/merch/candy.svg', name: { en: 'Sweets', uk: 'Цукерки' } }
];

export const prizeFor = (score: number): Prize => PRIZES.find((p) => score >= p.min) ?? PRIZES[PRIZES.length - 1];
