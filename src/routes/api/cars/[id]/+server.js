import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { apiErrorResponse, requireAuth, requireCatalogReadPermission } from '$lib/server/auth';
import { carSelection, validateCarId } from '$lib/server/cars';

export async function GET({ request, params }) {
	try {
		requireCatalogReadPermission(await requireAuth(request));
		const snapshot = await adminDb.collection('cars').doc(validateCarId(params.id)).get();
		return json({ car: carSelection(snapshot) }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		return apiErrorResponse(error);
	}
}
