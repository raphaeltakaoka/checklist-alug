import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import * as env from '$app/env/private';

function initializeAdmin() {
	if (getApps().length > 0) return getApps()[0];

	if (!env.FIREBASE_SERVICE_ACCOUNT) {
		throw new Error('FIREBASE_SERVICE_ACCOUNT is required for server APIs.');
	}

	let serviceAccount;
	try {
		serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT);
	} catch {
		throw new Error('FIREBASE_SERVICE_ACCOUNT must contain valid JSON.');
	}

	return initializeApp({
		credential: cert(serviceAccount),
		storageBucket:
			env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.firebasestorage.app`
	});
}

const adminApp = initializeAdmin();

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminMessaging = getMessaging(adminApp);
export const adminStorage = getStorage(adminApp);
