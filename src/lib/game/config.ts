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
}

export const TUNING: Tuning = {
	stingSpeed: 2600,
	stingSpread: 0.2,
	shahedSpeed: 1100,
	// Менше — і хвіст великого Шахеда ще закриває контур, коли туди приходить Стінг.
	gapMin: 0.55,
	gapMax: 1.15
};

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
