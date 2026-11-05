import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { apiErrorResponse, requireAuth, requireCatalogReadPermission } from '$lib/server/auth';
import { searchContacts } from '$lib/server/contacts';

export async function GET({ request, url }) {
	try {
		requireCatalogReadPermission(await requireAuth(request), 'contacts');
		return json({ contacts: await searchContacts(adminDb, url.searchParams.get('q') || '') }, {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return apiErrorResponse(error);
	}
}
