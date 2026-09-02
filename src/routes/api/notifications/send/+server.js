import { json } from '@sveltejs/kit';
import { adminDb, adminMessaging } from '$lib/server/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
	ApiError,
	apiErrorResponse,
	requireAuth,
	requirePermission
} from '$lib/server/auth';
import { boundedString, readExactJson } from '$lib/server/requestValidation';

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 5;
const PERMANENT_TOKEN_ERRORS = new Set([
	'messaging/registration-token-not-registered',
	'messaging/invalid-registration-token'
]);

async function enforceRateLimit(uid) {
	const ref = adminDb.collection('checklist_rate_limits').doc(`notification_${uid}`);
	await adminDb.runTransaction(async (transaction) => {
		const now = Date.now();
		const snapshot = await transaction.get(ref);
		const data = snapshot.data() || {};
		const windowStartedAt = data.windowStartedAt?.toMillis?.() || 0;
		const inWindow = now - windowStartedAt < RATE_LIMIT_WINDOW_MS;
		const count = inWindow ? Number(data.count || 0) : 0;
		if (count >= RATE_LIMIT_MAX) {
			throw new ApiError(429, 'Notification rate limit exceeded.');
		}
		transaction.set(ref, {
			count: count + 1,
			windowStartedAt: inWindow ? data.windowStartedAt : FieldValue.serverTimestamp(),
			expiresAt: new Date(now + RATE_LIMIT_WINDOW_MS * 2)
		});
	});
}

export async function POST({ request }) {
	try {
		const decodedToken = await requireAuth(request);
		requirePermission(decodedToken, 'administrator', 'write');
		const payload = await readExactJson(request, ['userId', 'title', 'body']);
		const userId = boundedString(payload.userId, 'userId', { max: 128 });
		const title = boundedString(payload.title, 'title', { max: 100 });
		const body = boundedString(payload.body, 'body', { max: 500 });
		await enforceRateLimit(decodedToken.uid);

		const userDoc = await adminDb.collection('users').doc(userId).get();
		if (!userDoc.exists) {
			throw new ApiError(404, 'User not found.');
		}

		const fcmTokens = Array.isArray(userDoc.data()?.fcmTokens)
			? userDoc.data().fcmTokens.filter((token) => typeof token === 'string').slice(0, 10)
			: [];
		if (fcmTokens.length === 0) {
			throw new ApiError(400, 'User has no registered notification devices.');
		}

        const messagePayload = {
            notification: {
                title,
                body
            },
            tokens: fcmTokens
        };

		const response = await adminMessaging.sendEachForMulticast(messagePayload);
		const permanentlyInvalidTokens = [];
		response.responses.forEach((resp, idx) => {
			if (!resp.success && PERMANENT_TOKEN_ERRORS.has(resp.error?.code)) {
				permanentlyInvalidTokens.push(fcmTokens[idx]);
			}
		});

		if (permanentlyInvalidTokens.length > 0) {
			await adminDb.collection('users').doc(userId).update({
				fcmTokens: FieldValue.arrayRemove(...permanentlyInvalidTokens)
			});
		}

		return json(
			{
				success: true,
				successCount: response.successCount,
				failureCount: response.failureCount
			},
			{ headers: { 'cache-control': 'no-store' } }
		);
	} catch (error) {
		if (!(error instanceof ApiError)) console.error('Error sending push notification:', error);
		return apiErrorResponse(error);
	}
}
