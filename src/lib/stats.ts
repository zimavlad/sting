import { TIERS } from './game/config';
import type { StingEvent } from './events';

export const TIME_ZONE = 'Europe/Kyiv';

export interface StatsFilter {
	epoch: string | null;
	/** Лише події з кіоску стенду — без наших тестів із телефонів. */
	kioskOnly: boolean;
}

export interface EpochInfo {
	epoch: string;
	first: number;
	last: number;
	attempts: number;
}

export interface DeviceInfo {
	device: string;
	kiosk: boolean;
	version: string;
	lastSeen: number;
	boots: number;
	fps: number | null;
	queued: number | null;
}

export interface Stats {
	attempts: number;
	sessions: number;
	hits: number;
	early: number;
	late: number;
	intercepted: number;
	avg: number | null;
	median: number | null;
	best: number | null;
	/** 10 кошиків по 10%: [0–10), …, [90–100]. */
	dist: number[];
	/** Помилка в мс серед влучань: кошики по 20 мс від −120 до +120, крайні збирають решту. */
	errDist: number[];
	avgErrMs: number | null;
	lateShare: number | null;
	perSession: number | null;
	retryShare: number | null;
	avgSessionSec: number | null;
	byHour: { hour: string; attempts: number }[];
	lang: { en: number; uk: number };
	first: number | null;
	last: number | null;
}

export const ERR_EDGES = [-120, -100, -80, -60, -40, -20, 0, 20, 40, 60, 80, 100, 120];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function median(xs: number[]) {
	if (!xs.length) return null;
	const s = [...xs].sort((a, b) => a - b);
	const m = s.length >> 1;
	return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const hourFmt = new Intl.DateTimeFormat('sv-SE', {
	timeZone: TIME_ZONE,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit',
	hour: '2-digit',
	hourCycle: 'h23'
});

export const hourKey = (t: number) => hourFmt.format(t).replace(/:.*/, '');

export function epochs(events: StingEvent[]): EpochInfo[] {
	const map = new Map<string, EpochInfo>();
	for (const e of events) {
		const info = map.get(e.epoch) ?? { epoch: e.epoch, first: e.t, last: e.t, attempts: 0 };
		info.first = Math.min(info.first, e.t);
		info.last = Math.max(info.last, e.t);
		if (e.type === 'attempt') info.attempts++;
		map.set(e.epoch, info);
	}
	return [...map.values()].sort((a, b) => b.last - a.last);
}

export function devices(events: StingEvent[]): DeviceInfo[] {
	const map = new Map<string, DeviceInfo>();
	for (const e of events) {
		const d = map.get(e.device) ?? {
			device: e.device,
			kiosk: e.kiosk,
			version: e.v,
			lastSeen: e.t,
			boots: 0,
			fps: null,
			queued: null
		};
		if (e.t >= d.lastSeen) {
			d.lastSeen = e.t;
			d.kiosk = e.kiosk;
			d.version = e.v;
		}
		if (e.type === 'boot') d.boots++;
		if (e.type === 'hb') {
			d.fps = num(e.data?.fps);
			d.queued = num(e.data?.queued);
		}
		map.set(e.device, d);
	}
	return [...map.values()].sort((a, b) => b.lastSeen - a.lastSeen);
}

export function filterEvents(events: StingEvent[], f: StatsFilter) {
	return events.filter((e) => (!f.epoch || e.epoch === f.epoch) && (!f.kioskOnly || e.kiosk));
}

export function aggregate(events: StingEvent[]): Stats {
	const attempts = events.filter((e) => e.type === 'attempt');
	const scores = attempts.map((e) => num(e.data?.score) ?? 0);
	const hits = attempts.filter((e) => e.data?.outcome === 'hit');
	const errs = hits.map((e) => num(e.data?.errMs)).filter((v): v is number => v !== null);
	const ends = events.filter((e) => e.type === 'end');
	const endAttempts = ends.map((e) => num(e.data?.attempts) ?? 0);

	const dist = Array(10).fill(0);
	for (const s of scores) dist[Math.min(9, Math.floor(s / 10))]++;

	const errDist = Array(ERR_EDGES.length - 1).fill(0);
	for (const ms of errs) {
		let i = ERR_EDGES.findIndex((edge) => ms < edge) - 1;
		if (i < 0) i = ms < ERR_EDGES[0] ? 0 : errDist.length - 1;
		errDist[i]++;
	}

	const hours = new Map<string, number>();
	for (const e of attempts) hours.set(hourKey(e.t), (hours.get(hourKey(e.t)) ?? 0) + 1);

	const lang = { en: 0, uk: 0 };
	for (const e of events) if (e.type === 'start') lang[e.data?.lang === 'uk' ? 'uk' : 'en']++;

	const avg = mean(scores);
	const avgErr = mean(errs);
	const sessionMs = mean(ends.map((e) => num(e.data?.ms) ?? 0));
	const perSession = mean(endAttempts);

	return {
		attempts: attempts.length,
		sessions: events.filter((e) => e.type === 'start').length,
		hits: hits.length,
		early: attempts.filter((e) => e.data?.outcome === 'early').length,
		late: attempts.filter((e) => e.data?.outcome === 'miss').length,
		intercepted: scores.filter((s) => s >= TIERS.intercepted).length,
		avg: avg === null ? null : Math.round(avg * 10) / 10,
		median: median(scores),
		best: scores.length ? Math.max(...scores) : null,
		dist,
		errDist,
		avgErrMs: avgErr === null ? null : Math.round(avgErr),
		lateShare: errs.length ? errs.filter((v) => v > 0).length / errs.length : null,
		perSession: perSession === null ? null : Math.round(perSession * 10) / 10,
		retryShare: ends.length ? endAttempts.filter((n) => n > 1).length / ends.length : null,
		avgSessionSec: sessionMs === null ? null : Math.round(sessionMs / 100) / 10,
		byHour: [...hours].map(([hour, n]) => ({ hour, attempts: n })).sort((a, b) => a.hour.localeCompare(b.hour)),
		lang,
		first: events.length ? events[0].t : null,
		last: events.length ? events[events.length - 1].t : null
	};
}
