import type { Verdict } from './game/sim';

export type Lang = 'en' | 'uk';

interface Strings {
	title: string;
	play: string;
	best: string;
	hint: string;
	verdict: Record<Verdict, string>;
	late: (ms: number) => string;
	early: (ms: number) => string;
	exact: string;
	better: (pct: number) => string;
	retry: string;
	rotate: string;
}

export const STRINGS: Record<Lang, Strings> = {
	en: {
		title: 'Could you catch the Sting?',
		play: 'Tap anywhere to play',
		best: 'Best score',
		hint: 'Tap the moment the Sting fills the outline',
		verdict: {
			intercepted: 'Intercepted',
			close: 'So close',
			near: 'Not bad',
			missed: 'Missed',
			early: 'Too early',
			late: 'Too late'
		},
		late: (ms) => `${ms} ms late`,
		early: (ms) => `${ms} ms early`,
		exact: 'Right on time',
		better: (pct) => `Better than ${pct}% of players`,
		retry: 'Tap to try again',
		rotate: 'Turn your phone sideways'
	},
	uk: {
		title: 'Зможеш спіймати Стінг?',
		play: 'Торкнись екрана, щоб зіграти',
		best: 'Найкращий результат',
		hint: 'Торкнись, коли Стінг влетить у контур',
		verdict: {
			intercepted: 'Перехоплено',
			close: 'Зовсім поруч',
			near: 'Непогано',
			missed: 'Промах',
			early: 'Зарано',
			late: 'Запізно'
		},
		late: (ms) => `Запізно на ${ms} мс`,
		early: (ms) => `Зарано на ${ms} мс`,
		exact: 'Точно в момент',
		better: (pct) => `Краще, ніж ${pct}% гравців`,
		retry: 'Торкнись, щоб спробувати ще',
		rotate: 'Поверни телефон горизонтально'
	}
};
