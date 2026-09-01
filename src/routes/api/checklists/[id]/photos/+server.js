import { json } from '@sveltejs/kit';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, adminStorage } from '$lib/server/admin';
import {
	ApiError,
	apiErrorResponse,
	assertInspectionAccess,
	requireAuth
} from '$lib/server/auth';
import { readExactJson } from '$lib/server/requestValidation';

const PART_IDS = new Set([
	'front_bumper', 'hood', 'windshield', 'roof', 'rear_glass', 'trunk', 'rear_bumper',
	'left_fender', 'left_front_door', 'left_front_window', 'left_rear_door',
	'left_rear_window', 'left_rear_quarter', 'right_fender', 'right_front_door',
	'right_front_window', 'right_rear_door', 'right_rear_window', 'right_rear_quarter',
	'interior', 'left_front_wheel', 'right_front_wheel', 'left_rear_wheel',
	'right_rear_wheel'
]);

export async function DELETE({ request, params }) {
	try {
		if (typeof params.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(params.id)) {
			throw new ApiError(400, 'Invalid inspection ID.');
		}
		const decodedToken = await requireAuth(request);
		const payload = await readExactJson(request, ['partKey', 'photoPath']);
		if (
			!PART_IDS.has(payload.partKey) ||
			typeof payload.photoPath !== 'string' ||
			payload.photoPath.length > 300
		) {
			throw new ApiError(400, 'Invalid photo reference.');
		}
		const { partKey, photoPath } = payload;

		const detailRef = adminDb.collection('checklists').doc(params.id);
		let partStates;
		await adminDb.runTransaction(async (transaction) => {
			const detail = await transaction.get(detailRef);
			if (!detail.exists) throw new ApiError(404, 'Inspection not found.');
			const inspection = detail.data();
			assertInspectionAccess(decodedToken, inspection, 'write');
			const prefix = `checklists/${inspection.ownerUid}/${params.id}/`;
			if (!photoPath.startsWith(prefix) || photoPath.includes('..')) {
				throw new ApiError(400, 'Invalid stored photo path.');
			}

			const state = inspection.partStates?.[partKey];
			const photoIndex = Array.isArray(state?.photoPaths)
				? state.photoPaths.indexOf(photoPath)
				: -1;
			if (photoIndex === -1) {
				partStates = inspection.partStates;
				return;
			}
			const photos = state.photos.filter((_, index) => index !== photoIndex);
			const photoPaths = state.photoPaths.filter((_, index) => index !== photoIndex);
			partStates = {
				...inspection.partStates,
				[partKey]: { ...state, photos, photoPaths }
			};

			transaction.update(detailRef, {
				partStates,
				updatedAt: FieldValue.serverTimestamp()
			});
			transaction.set(
				adminDb.collection('checklist_summaries').doc(params.id),
				{ updatedAt: FieldValue.serverTimestamp() },
				{ merge: true }
			);
		});
		await adminStorage.bucket().file(photoPath).delete({ ignoreNotFound: true });

		return json(
			{ success: true, partStates },
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		if (!(error instanceof ApiError)) console.error('Checklist photo deletion failed:', error);
		return apiErrorResponse(error);
	}
}
