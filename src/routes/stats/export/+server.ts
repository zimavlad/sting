import { rawExport } from '$lib/server/store';
import type { RequestHandler } from './$types';

/** Сирі події для власного аналізу; доступ — той самий пароль, що й до /stats. */
export const GET: RequestHandler = async () =>
	new Response(await rawExport(), {
		headers: {
			'content-type': 'application/x-ndjson; charset=utf-8',
			'content-disposition': `attachment; filename="sting-events-${new Date().toISOString().slice(0, 10)}.jsonl"`
		}
	});
