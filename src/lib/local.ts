// Усе, що кіоск памʼятає між перезапусками. localStorage може бути недоступний
// (приватне вікно, заборонені дані сайту) — тоді гра працює, просто без памʼяті.

import type { Level } from './game/config';

const PREFIX = 'sting.';

function read<T>(key: string, fallback: T): T {
	try {
		const raw = localStorage.getItem(PREFIX + key);
		return raw === null ? fallback : (JSON.parse(raw) as T);
	} catch {
		return fallback;
	}
}

function write(key: string, value: unknown) {
	try {
		localStorage.setItem(PREFIX + key, JSON.stringify(value));
	} catch {
		// Повне або заборонене сховище — не привід зупиняти гру.
	}
}

function remove(key: string) {
	try {
		localStorage.removeItem(PREFIX + key);
	} catch {
		// те саме
	}
}

export const uid = () =>
	typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: Math.random().toString(36).slice(2) + Date.now().toString(36);

export interface Settings {
	/** Затримка сенсора й екрана, мс; віднімається від моменту дотику. */
	latencyMs: number;
	/** Множник швидкості обох дронів. */
	speed: number;
	/** Рівень складності: перемикає людина на стенді залежно від черги. */
	level: Level;
	/** Пристрій на стенді: ховає курсор, не дає екрану заснути, позначає події. */
	kiosk: boolean;
}

const DEFAULTS: Settings = { latencyMs: 0, speed: 1, level: 1, kiosk: false };

export const loadSettings = (): Settings => ({ ...DEFAULTS, ...read<Partial<Settings>>('settings', {}) });
export const saveSettings = (s: Settings) => write('settings', s);

export function deviceId(): string {
	let id = read<string | null>('device', null);
	if (!id) write('device', (id = uid().slice(0, 8)));
	return id;
}

/** Ідентифікатор поточного «заходу»: обнулення лічильника починає новий. */
export function currentEpoch(): string {
	let id = read<string | null>('epoch', null);
	if (!id) write('epoch', (id = newEpochId()));
	return id;
}

function newEpochId() {
	return new Date().toISOString().slice(0, 16).replace('T', ' ');
}

export function startNewEpoch(): string {
	remove(`scores.${currentEpoch()}`);
	const id = newEpochId();
	write('epoch', id);
	return id;
}

export const loadScores = (epoch: string) => read<number[]>(`scores.${epoch}`, []);
export const saveScores = (epoch: string, scores: number[]) => write(`scores.${epoch}`, scores);

export const loadQueue = <T>() => read<T[]>('queue', []);
export const saveQueue = (q: unknown[]) => write('queue', q);
