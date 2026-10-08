import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { apiErrorResponse, requireAuth, requireCatalogReadPermission } from '$lib/server/auth';
import { searchCars } from '$lib/server/cars';

export async function GET({ request, url }) {
	try {
		requireCatalogReadPermission(await requireAuth(request));
		return json({ cars: await searchCars(adminDb, url.searchParams.get('q') || '') }, {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return apiErrorResponse(error);
	}
}
