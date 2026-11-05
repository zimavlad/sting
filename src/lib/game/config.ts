// Уся геометрія — у пікселях сцени 1920×1080; на екран вона масштабується цілком.
export const STAGE = { w: 1920, h: 1080 } as const;
export const TARGET = { x: 960, y: 540 } as const;
export const STING_LEN = 340;
/** Піврозмах Стінга — для мірної лінії. */
export const STING_HALF_SPAN = 0.44 * STING_LEN;
/** Шахед удвічі довший за Стінг: у реальності він ще більший, але так обидва влазять у кадр. */
export const SHAHED_LEN = 640;

export interface Tuning {
	/** Базова швидкість Стінга, px сцени за секунду. */
	stingSpeed: number;
	/** Розкид швидкості Стінга між спробами, частка від базової (0.2 = ±20%). */
	stingSpread: number;
	shahedSpeed: number;
	/** Через скільки секунд після Шахеда Стінг приходить у контур — випадково в цих межах. */
	gapMin: number;
	gapMax: number;
	/** Множник швидкості обох дронів на цьому рівні. */
	speed: number;
	/** Скільки Шахедів у раунді. */
	shaheds: number;
	/** Стінг може летіти на будь-якому місці в черзі, а не лише останнім. */
	anyOrder: boolean;
	/** Випадкова пауза перед першим дроном, с: щоб не вгадували старт за звичкою. */
	leadMax: number;
}

export const TUNING: Tuning = {
	stingSpeed: 2600,
	stingSpread: 0.2,
	shahedSpeed: 1100,
	// Менше — і хвіст великого Шахеда ще закриває контур, коли туди приходить Стінг.
	gapMin: 0.55,
	gapMax: 1.15,
	speed: 1,
	shaheds: 1,
	anyOrder: false,
	leadMax: 0
};

export type Level = 1 | 2 | 3;

export const LEVELS: Record<Level, Tuning> = {
	1: TUNING,
	2: { ...TUNING, stingSpread: 0.3, anyOrder: true, leadMax: 0.6 },
	3: { ...TUNING, stingSpread: 0.3, anyOrder: true, leadMax: 0.6, speed: 1.2, shaheds: 2 }
};

/** Черга дронів на рівнях із випадковим порядком, с. */
export const QUEUE = {
	/** Шахед за Стінгом заходить у кадр через стільки після нього: видно, що Стінг перший. */
	trailMin: 0.15,
	trailMax: 0.65,
	/** Між двома Шахедами поспіль: менше 0.58 с — і вони налізуть один на одного. */
	spacingMin: 0.75,
	spacingMax: 1.3
} as const;

export const TIMING = {
	/** Контур і підказка перед польотом. */
	readyMs: 900,
	/** Дотики одразу після старту польоту не рахуються. */
	ignoreMs: 250,
	/** Скільки результат не можна пропустити, щоб той самий дотик не запустив нову спробу. */
	resultLockMs: 700,
	/** Без дотиків на екрані результату — назад в очікування. */
	idleMs: 8000,
	/** Утримання лівого верхнього кута, щоб відкрити налаштування стенду. */
	adminHoldMs: 3000
};

/** Межі вердиктів у відсотках. */
export const TIERS = { intercepted: 95, close: 80, near: 50 } as const;

/** З якої кількості попередніх спроб показувати «краще, ніж N% гравців». */
export const PERCENTILE_MIN = 10;
