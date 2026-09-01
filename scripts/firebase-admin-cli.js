import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

export const EXPECTED_PROJECT_ID = 'cadastro-alug---dev';

export function parseArgs(argv = process.argv.slice(2)) {
	const values = new Map();
	const flags = new Set();

	for (let index = 0; index < argv.length; index += 1) {
		const value = argv[index];
		if (!value.startsWith('--')) {
			throw new Error(`Unexpected argument: ${value}`);
		}

		const next = argv[index + 1];
		if (next && !next.startsWith('--')) {
			values.set(value, next);
			index += 1;
		} else {
			flags.add(value);
		}
	}

	return {
		execute: flags.has('--execute'),
		value(name) {
			return values.get(name);
		}
	};
}

export function initializeGuardedAdmin() {
	if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
		throw new Error('Production maintenance scripts refuse to run against emulator environment variables.');
	}

	if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
		throw new Error('FIREBASE_SERVICE_ACCOUNT is required.');
	}

	let serviceAccount;
	try {
		serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
	} catch {
		throw new Error('FIREBASE_SERVICE_ACCOUNT must be valid JSON.');
	}

	if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
		throw new Error(
			`Refusing to run: service account project must be ${EXPECTED_PROJECT_ID}, received ${serviceAccount.project_id || 'unknown'}.`
		);
	}

	const app =
		getApps()[0] ||
		initializeApp({
			credential: cert(serviceAccount),
			projectId: EXPECTED_PROJECT_ID,
			storageBucket:
				process.env.FIREBASE_STORAGE_BUCKET || `${EXPECTED_PROJECT_ID}.firebasestorage.app`
		});

	return {
		auth: getAuth(app),
		db: getFirestore(app),
		bucket: getStorage(app).bucket()
	};
}

export async function listAllUsers(auth) {
	const users = [];
	let pageToken;
	do {
		const page = await auth.listUsers(1000, pageToken);
		users.push(...page.users);
		pageToken = page.pageToken;
	} while (pageToken);
	return users;
}

export function redactUid(uid) {
	return createHash('sha256').update(uid).digest('hex').slice(0, 12);
}
