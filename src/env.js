import { defineEnvVars } from '@sveltejs/kit/env';

export const variables = defineEnvVars({
	// Firebase browser configuration stays public and is embedded at build time.
	PUBLIC_FIREBASE_API_KEY: { public: true, static: true },
	PUBLIC_FIREBASE_AUTH_DOMAIN: { public: true, static: true },
	PUBLIC_FIREBASE_PROJECT_ID: { public: true, static: true },
	PUBLIC_FIREBASE_STORAGE_BUCKET: { public: true, static: true },
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID: { public: true, static: true },
	PUBLIC_FIREBASE_APP_ID: { public: true, static: true },
	PUBLIC_FIREBASE_VAPID_KEY: { public: true, static: true },
	// Admin credentials are private and read from the server environment at runtime.
	FIREBASE_SERVICE_ACCOUNT: {},
	FIREBASE_STORAGE_BUCKET: {}
});
