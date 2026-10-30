import { readEvents } from '$lib/server/store';
import { aggregate, devices, epochs, filterEvents } from '$lib/stats';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const all = await readEvents();
	const hasKiosk = all.some((e) => e.kiosk);
	const scope = url.searchParams.get('scope') ?? (hasKiosk ? 'kiosk' : 'all');
	const kioskOnly = scope === 'kiosk';

	const pool = kioskOnly ? all.filter((e) => e.kiosk) : all;
	const epochList = epochs(pool);
	// За замовчуванням — останній захід: після обнулення лічильника цікавить саме він.
	const epochParam = url.searchParams.get('epoch');
	const epoch = epochParam === 'all' ? null : (epochParam ?? epochList[0]?.epoch ?? null);

	const events = filterEvents(all, { epoch, kioskOnly });
	return {
		stats: aggregate(events),
		epochs: epochList,
		epoch,
		scope: kioskOnly ? 'kiosk' : 'all',
		hasKiosk,
		devices: devices(all),
		errors: events
			.filter((e) => e.type === 'error')
			.slice(-20)
			.reverse()
			.map((e) => ({ t: e.t, device: e.device, msg: String(e.data?.msg ?? '') })),
		total: all.length
	};
};
