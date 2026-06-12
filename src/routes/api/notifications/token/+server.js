import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST({ request }) {
    try {
        const { userId, token } = await request.json();

        if (!userId || !token) {
            return json({ error: 'Missing userId or token' }, { status: 400 });
        }

        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.update({
            fcmTokens: FieldValue.arrayUnion(token)
        });

        return json({ success: true });
    } catch (error) {
        console.error('Error adding FCM token:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE({ request }) {
    try {
        const { userId, token } = await request.json();

        if (!userId || !token) {
            return json({ error: 'Missing userId or token' }, { status: 400 });
        }

        const userRef = adminDb.collection('users').doc(userId);
        
        await userRef.update({
            fcmTokens: FieldValue.arrayRemove(token)
        });

        return json({ success: true });
    } catch (error) {
        console.error('Error removing FCM token:', error);
        return json({ error: 'Internal server error' }, { status: 500 });
    }
}
