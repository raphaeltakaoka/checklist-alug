import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { ApiError, apiErrorResponse, requireAuth } from '$lib/server/auth';
import { boundedString, readExactJson } from '$lib/server/requestValidation';

async function notificationToken(request) {
	const payload = await readExactJson(request, ['token']);
	return boundedString(payload.token, 'notification token', { min: 20, max: 4096 });
}

export async function POST({ request }) {
	try {
		const decodedToken = await requireAuth(request);
		const token = await notificationToken(request);

		const userRef = adminDb.collection('users').doc(decodedToken.uid);
		await adminDb.runTransaction(async (transaction) => {
			const snapshot = await transaction.get(userRef);
			const current = snapshot.exists && Array.isArray(snapshot.data()?.fcmTokens)
				? snapshot.data().fcmTokens.filter((value) => typeof value === 'string')
				: [];
			const next = [token, ...current.filter((value) => value !== token)].slice(0, 10);
			transaction.set(userRef, { fcmTokens: next }, { merge: true });
		});

		return json({ success: true }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (!(error instanceof ApiError)) console.error('Error adding FCM token:', error);
		return apiErrorResponse(error);
	}
}

export async function DELETE({ request }) {
	try {
		const decodedToken = await requireAuth(request);
		const token = await notificationToken(request);

		const userRef = adminDb.collection('users').doc(decodedToken.uid);
		await adminDb.runTransaction(async (transaction) => {
			const snapshot = await transaction.get(userRef);
			if (!snapshot.exists) return;
			const current = Array.isArray(snapshot.data()?.fcmTokens)
				? snapshot.data().fcmTokens
				: [];
			transaction.update(userRef, {
				fcmTokens: current.filter((value) => value !== token).slice(0, 10)
			});
		});

		return json({ success: true }, { headers: { 'cache-control': 'no-store' } });
	} catch (error) {
		if (!(error instanceof ApiError)) console.error('Error removing FCM token:', error);
		return apiErrorResponse(error);
	}
}
