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
 * Мерч за результат, від дорогого до дешевого — список і пороги від замовника (15.11.2026).
 * Пороги спільні для всіх рівнів. Футболка — лише за 100.0% на екрані, тобто за влучання без
 * жодного зсуву. Картинки — заглушки: фото можна покласти в static/merch і змінити тут image.
 */
export const PRIZES: readonly Prize[] = [
	{ id: 'tshirt', min: 100, image: '/merch/tshirt.svg', name: { en: 'T-shirt', uk: 'Футболка' } },
	{ id: 'keychain', min: 50, image: '/merch/keychain.svg', name: { en: 'Keychain', uk: 'Брелок' } },
	{ id: 'stickers', min: 0, image: '/merch/stickers.svg', name: { en: 'Stickers', uk: 'Стікери' } }
];

export const prizeFor = (score: number): Prize => PRIZES.find((p) => score >= p.min) ?? PRIZES[PRIZES.length - 1];
