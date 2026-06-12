import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '$env/dynamic/private';

if (!getApps().length) {
    try {
        if (env.FIREBASE_SERVICE_ACCOUNT) {
            const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
            initializeApp({
                credential: cert(serviceAccount)
            });
        } else {
            console.warn("FIREBASE_SERVICE_ACCOUNT env var is not set. Firebase Admin push notifications will fail.");
            // Initialize without cert for local dev without service account, though messaging will fail
            initializeApp();
        }
    } catch (err) {
        console.error('Firebase admin initialization error', err);
    }
}

export const adminDb = getFirestore();
export const adminMessaging = getMessaging();
