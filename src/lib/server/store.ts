import { appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import type { StingEvent } from '$lib/events';

// Події лежать файлами по днях (за часом сервера): /data/events/YYYY-MM-DD.jsonl.
// Подій на виставку — тисячі, тож статистика рахується простим читанням усіх файлів.

const dir = () => join(env.DATA_DIR || './data', 'events');

export async function appendEvents(events: StingEvent[]) {
	if (!events.length) return;
	await mkdir(dir(), { recursive: true });
	const day = new Date().toISOString().slice(0, 10);
	const received = Date.now();
	const lines = events.map((e) => JSON.stringify({ ...e, r: received })).join('\n') + '\n';
	await appendFile(join(dir(), `${day}.jsonl`), lines);
}

/** Усі події без дублікатів: кіоск міг надіслати пакет двічі, якщо відповідь загубилась. */
export async function readEvents(): Promise<StingEvent[]> {
	let files: string[];
	try {
		files = (await readdir(dir())).filter((f) => f.endsWith('.jsonl')).sort();
	} catch {
		return [];
	}
	const seen = new Set<string>();
	const out: StingEvent[] = [];
	for (const f of files) {
		for (const line of (await readFile(join(dir(), f), 'utf8')).split('\n')) {
			if (!line) continue;
			try {
				const e = JSON.parse(line) as StingEvent;
				if (seen.has(e.id)) continue;
				seen.add(e.id);
				out.push(e);
			} catch {
				// Обірваний рядок після аварійного перезапуску — пропускаємо.
			}
		}
	}
	return out.sort((a, b) => a.t - b.t);
}

export async function rawExport(): Promise<string> {
	return (await readEvents()).map((e) => JSON.stringify(e)).join('\n') + '\n';
}
