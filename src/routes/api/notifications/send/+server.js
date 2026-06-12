import { json } from '@sveltejs/kit';
import { adminDb, adminMessaging } from '$lib/server/admin';

export async function POST({ request }) {
    try {
        const { userId, title, body } = await request.json();

        if (!userId || !title || !body) {
            return json({ error: 'Missing userId, title, or body' }, { status: 400 });
        }

        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (!userDoc.exists) {
            return json({ error: 'User not found' }, { status: 404 });
        }

        const fcmTokens = userDoc.data()?.fcmTokens;
        if (!fcmTokens || !Array.isArray(fcmTokens) || fcmTokens.length === 0) {
            return json({ error: 'User has no registered devices for notifications' }, { status: 400 });
        }

        const messagePayload = {
            notification: {
                title,
                body
            },
            tokens: fcmTokens
        };

        // Send notifications to all registered devices for this user
        const response = await adminMessaging.sendEachForMulticast(messagePayload);
        
        // Optional: Remove invalid tokens (e.g. user uninstalled PWA)
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                failedTokens.push(fcmTokens[idx]);
            }
        });

        if (failedTokens.length > 0) {
            console.log(`[Push API] Removed ${failedTokens.length} invalid tokens for user ${userId}`);
            const { FieldValue } = await import('firebase-admin/firestore');
            await adminDb.collection('users').doc(userId).update({
                fcmTokens: FieldValue.arrayRemove(...failedTokens)
            });
        }

        return json({ 
            success: true, 
            successCount: response.successCount, 
            failureCount: response.failureCount 
        });
    } catch (error) {
        console.error('Error sending push notification:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}
