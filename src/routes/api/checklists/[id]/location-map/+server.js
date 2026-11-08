import { adminDb } from '$lib/server/admin';
import { ApiError, apiErrorResponse, assertInspectionAccess, requireAuth } from '$lib/server/auth';
import { ensureChecklistLocationMap, readChecklistLocationMap } from '$lib/server/checklistLocationMap.js';

async function respond({ request, params }, generate) {
	try {
		if (typeof params.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.id)) throw new ApiError(400, 'Invalid inspection ID.');
		const identity = await requireAuth(request);
		const ref = adminDb.collection('checklists').doc(params.id);
		const inspection = (await ref.get()).data();
		if (!inspection) throw new ApiError(404, 'Inspection not found.');
		assertInspectionAccess(identity, inspection, 'read');
		if (generate) {
			const path = await ensureChecklistLocationMap(ref, inspection);
			if (path) inspection.location.mapImagePath = path;
		}
		const image = await readChecklistLocationMap(params.id, inspection);
		if (!image) throw new ApiError(404, 'Mapa ainda indisponível.');
		return new Response(new Uint8Array(image), {
			headers: { 'content-type': 'image/png', 'cache-control': 'private, no-store' }
		});
	} catch (error) {
		return apiErrorResponse(error instanceof ApiError ? error : new ApiError(503, 'Mapa indisponível.'));
	}
}

export const GET = event => respond(event, false);
export const POST = event => respond(event, true);
