/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Гра має працювати, навіть коли на стенді пропав інтернет: усе потрібне
// кладемо в кеш одразу при встановленні, а мережу питаємо лише по нову версію.

import { build, files, prerendered, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `sting-${version}`;
const ASSETS = new Set([...build, ...files, ...prerendered]);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll([...ASSETS]))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	// Аналітика й статистика — тільки з мережі.
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/stats')) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (ASSETS.has(url.pathname)) {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}
			try {
				return await fetch(request);
			} catch {
				// Офлайн: будь-яка сторінка гри — це та сама оболонка.
				const fallback = (await cache.match(url.pathname)) ?? (await cache.match('/'));
				if (fallback) return fallback;
				throw new Error('offline');
			}
		})()
	);
});
