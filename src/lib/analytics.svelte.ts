import { version } from '$app/environment';
import type { EventType, StingEvent } from './events';
import { MAX_BATCH } from './events';
import { currentEpoch, deviceId, loadQueue, loadSettings, saveQueue, uid } from './local';

const FLUSH_MS = 10_000;
/** Більше не тримаємо: якщо інтернету нема днями, старі події не варті памʼяті кіоску. */
const QUEUE_CAP = 10_000;

/**
 * Черга подій: усе спершу пишеться в localStorage, а на сервер іде пакетами,
 * коли є мережа. Інтернет на стенді може зникати — дані від цього не губляться.
 */
class Analytics {
	queued = $state(0);
	lastSync = $state<number | null>(null);
	online = $state(true);

	private queue: StingEvent[] = [];
	private sending = false;
	private device = '';
	private epoch = '';
	session: string | undefined;

	start() {
		this.queue = loadQueue<StingEvent>();
		this.queued = this.queue.length;
		this.device = deviceId();
		this.epoch = currentEpoch();
		this.online = navigator.onLine;
		addEventListener('online', () => ((this.online = true), this.flush()));
		addEventListener('offline', () => (this.online = false));
		addEventListener('pagehide', () => this.beacon());
		setInterval(() => this.flush(), FLUSH_MS);
		this.flush();
	}

	setEpoch(epoch: string) {
		this.epoch = epoch;
	}

	track(type: EventType, data?: Record<string, unknown>) {
		const e: StingEvent = {
			id: uid(),
			t: Date.now(),
			type,
			device: this.device,
			epoch: this.epoch,
			kiosk: loadSettings().kiosk,
			v: version,
			...(this.session ? { session: this.session } : {}),
			...(data ? { data } : {})
		};
		this.queue.push(e);
		if (this.queue.length > QUEUE_CAP) this.queue.splice(0, this.queue.length - QUEUE_CAP);
		this.persist();
	}

	async flush() {
		if (this.sending || !this.queue.length) return;
		this.sending = true;
		const batch = this.queue.slice(0, MAX_BATCH);
		try {
			const res = await fetch('/api/events', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ events: batch })
			});
			if (res.ok) {
				const sent = new Set(batch.map((e) => e.id));
				this.queue = this.queue.filter((e) => !sent.has(e.id));
				this.persist();
				this.lastSync = Date.now();
				this.online = true;
				if (this.queue.length) queueMicrotask(() => this.flush());
			}
		} catch {
			this.online = false;
		} finally {
			this.sending = false;
		}
	}

	/** Сторінка закривається — віддаємо що є; сервер відкине дублікати за id. */
	private beacon() {
		if (!this.queue.length) return;
		const blob = new Blob([JSON.stringify({ events: this.queue.slice(0, MAX_BATCH) })], { type: 'application/json' });
		navigator.sendBeacon?.('/api/events', blob);
	}

	private persist() {
		saveQueue(this.queue);
		this.queued = this.queue.length;
	}
}

export const analytics = new Analytics();
