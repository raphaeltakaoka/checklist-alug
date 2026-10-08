import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { apiErrorResponse, requireAuth, requireCatalogReadPermission } from '$lib/server/auth';
import { contactSelection, validateContactId } from '$lib/server/contacts';

export async function GET({ request, params }) {
	try {
		requireCatalogReadPermission(await requireAuth(request));
		const snapshot = await adminDb.collection('contacts').doc(validateContactId(params.id)).get();
		return json({ contact: contactSelection(snapshot) }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		return apiErrorResponse(error);
	}
}
