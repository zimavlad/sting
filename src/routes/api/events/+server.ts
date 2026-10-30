import { error, json } from '@sveltejs/kit';
import { parseBatch } from '$lib/events';
import { appendEvents } from '$lib/server/store';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Очікую JSON');
	}
	const events = parseBatch(body);
	if (!events) error(400, 'Зіпсований пакет подій');
	await appendEvents(events);
	return json({ ok: true, n: events.length });
};
