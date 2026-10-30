// Формат подій аналітики — спільний для кіоску й сервера.

export const EVENT_TYPES = ['boot', 'start', 'attempt', 'end', 'lang', 'admin', 'error', 'hb'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface StingEvent {
	id: string;
	/** Час на пристрої, мс від епохи. */
	t: number;
	type: EventType;
	device: string;
	/** Захід, у межах якого рахуються відсотки; міняється обнуленням лічильника. */
	epoch: string;
	kiosk: boolean;
	/** Версія збірки. */
	v: string;
	session?: string;
	data?: Record<string, unknown>;
}

export const MAX_BATCH = 500;
const MAX_DATA_JSON = 4000;

const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** null — пакет зіпсований цілком; окремі криві події просто відкидаються. */
export function parseBatch(body: unknown): StingEvent[] | null {
	const list = (body as { events?: unknown })?.events;
	if (!Array.isArray(list) || list.length > MAX_BATCH) return null;
	const out: StingEvent[] = [];
	for (const raw of list) {
		if (typeof raw !== 'object' || raw === null) continue;
		const e = raw as Partial<StingEvent>;
		if (!str(e.id, 64) || !str(e.device, 64) || !str(e.epoch, 64) || !str(e.v, 64)) continue;
		if (typeof e.t !== 'number' || !Number.isFinite(e.t)) continue;
		if (!EVENT_TYPES.includes(e.type as EventType)) continue;
		if (e.session !== undefined && !str(e.session, 64)) continue;
		if (e.data !== undefined && (typeof e.data !== 'object' || e.data === null || Array.isArray(e.data))) continue;
		if (e.data && JSON.stringify(e.data).length > MAX_DATA_JSON) continue;
		out.push({
			id: e.id,
			t: e.t,
			type: e.type as EventType,
			device: e.device,
			epoch: e.epoch,
			kiosk: e.kiosk === true,
			v: e.v,
			...(e.session ? { session: e.session } : {}),
			...(e.data ? { data: e.data } : {})
		});
	}
	return out;
}
