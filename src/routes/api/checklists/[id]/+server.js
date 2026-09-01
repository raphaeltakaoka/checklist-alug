import { json } from '@sveltejs/kit';
import { adminDb, adminStorage } from '$lib/server/admin';
import {
	ApiError,
	apiErrorResponse,
	assertInspectionAccess,
	requireAuth
} from '$lib/server/auth';

function assertId(value) {
	if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
		throw new ApiError(400, 'Invalid inspection ID.');
	}
}

export async function DELETE({ request, params }) {
	try {
		assertId(params.id);
		const decodedToken = await requireAuth(request);
		const detailRef = adminDb.collection('checklists').doc(params.id);
		const summaryRef = adminDb.collection('checklist_summaries').doc(params.id);
		const [detail, summary] = await Promise.all([detailRef.get(), summaryRef.get()]);
		const inspection = detail.exists ? detail.data() : summary.data();
		if (inspection) assertInspectionAccess(decodedToken, inspection, 'delete');

		const batch = adminDb.batch();
		batch.delete(detailRef);
		batch.delete(summaryRef);
		await batch.commit();

		if (inspection?.ownerUid) {
			await adminStorage.bucket().deleteFiles({
				prefix: `checklists/${inspection.ownerUid}/${params.id}/`,
				force: true
			});
		}

		return json({ success: true }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (!(error instanceof ApiError)) console.error('Checklist deletion failed:', error);
		return apiErrorResponse(error);
	}
}
