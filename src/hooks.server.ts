import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';

function passwordOk(header: string | null): boolean {
	const expected = env.STATS_PASSWORD;
	if (!expected || !header?.startsWith('Basic ')) return false;
	const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	const given = Buffer.from(decoded.slice(decoded.indexOf(':') + 1));
	const want = Buffer.from(expected);
	return given.length === want.length && timingSafeEqual(given, want);
}

export const handle: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	// Статистика — лише для нас. Браузер сам покаже вікно логіна (логін будь-який).
	if (pathname === '/stats' || pathname.startsWith('/stats/')) {
		const open = dev && !env.STATS_PASSWORD;
		if (!open && !passwordOk(event.request.headers.get('authorization'))) {
			if (!env.STATS_PASSWORD) return new Response('STATS_PASSWORD не задано', { status: 503 });
			return new Response('Потрібен пароль', {
				status: 401,
				headers: { 'www-authenticate': 'Basic realm="sting-stats", charset="UTF-8"' }
			});
		}
	}

	const response = await resolve(event);
	// Після редеплою браузер не має тримати половину старого коду.
	if (!pathname.startsWith('/_app/immutable/')) response.headers.set('cache-control', 'no-cache');
	return response;
};
