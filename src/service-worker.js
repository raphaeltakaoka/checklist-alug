/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';
import { initializeApp } from "firebase/app";
import { getMessaging, onBackgroundMessage } from "firebase/messaging/sw";

// This gives `self` the correct Service Worker types
const self = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (globalThis.self));

// Create a unique cache name for this deployment version
const CACHE = `cache-${version}`;

const ASSETS = [
	...build, // SvelteKit compiled code and assets
	...files  // Everything inside the static directory
];

self.addEventListener('install', (event) => {
	// Create a new cache and add all files to it eagerly
	async function addFilesToCache() {
		const cache = await caches.open(CACHE);
		await cache.addAll(ASSETS);

		// Eagerly fetch and cache the root page "/" (SPA Shell)
		try {
			const rootResponse = await fetch('/');
			if (rootResponse.status === 200) {
				await cache.put('/', rootResponse);
			}
		} catch (err) {
			console.warn("Failed to eagerly cache SPA shell root during installation:", err);
		}
	}

	event.waitUntil(addFilesToCache());
});

self.addEventListener('activate', (event) => {
	// Remove older version caches from disk
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key !== CACHE) {
				await caches.delete(key);
			}
		}
	}

	// Claim any existing open clients immediately
	self.clients.claim();

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	// Ignore non-GET requests (e.g. POST for API, Firestore sync etc)
	if (event.request.method !== 'GET') return;

	async function respond() {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);

		// 1. Serve SvelteKit static / build assets from cache immediately
		if (ASSETS.includes(url.pathname)) {
			const response = await cache.match(url.pathname);
			if (response) {
				return response;
			}
		}

		// 2. Client-side navigation / page load SPA shell fallback
		// If requesting an HTML page (like /dashboard, /dashboard/new etc)
		const isNavigation = event.request.mode === 'navigate' ||
			(event.request.headers.get('accept') || '').includes('text/html');

		if (isNavigation) {
			try {
				// Try fetching the latest HTML from the network first
				const response = await fetch(event.request);
				if (response instanceof Response && response.status === 200) {
					// Update the root cache for offline fallback
					cache.put('/', response.clone());
					return response;
				}
			} catch (err) {
				// Network is unavailable (offline): serve the cached root "/" page
				// The client-side router will take over and load the correct view
				const response = await cache.match('/');
				if (response) {
					return response;
				}
			}
		}

		// 3. For all other GET requests, try the network first and cache the response
		try {
			const response = await fetch(event.request);

			if (!(response instanceof Response)) {
				throw new Error('Invalid response from fetch');
			}

			// Avoid caching Firestore/Auth API endpoints, WebSockets, Chrome Extensions, etc.
			const isLocal = url.origin === self.location.origin;
			const isFirebaseOrAPI = url.hostname.includes('firebase') || 
									url.pathname.startsWith('/__/auth') || 
									url.pathname.startsWith('/api/');

			if (response.status === 200 && isLocal && !isFirebaseOrAPI && !response.headers.get('cache-control')?.includes('no-store')) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			// If offline/network fails, fallback to cache for any previously cached dynamic assets
			const response = await cache.match(event.request);
			if (response) {
				return response;
			}
			throw err;
		}
	}

	event.respondWith(respond());
});

self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});

// === Firebase Cloud Messaging Background Setup ===
const firebaseConfig = {
  apiKey: "AIzaSyAGfpduRticKCZN4WzEVgWQKkIXVrsPbQs",
  authDomain: "cadastro-alug---dev.firebaseapp.com",
  projectId: "cadastro-alug---dev",
  storageBucket: "cadastro-alug---dev.firebasestorage.app",
  messagingSenderId: "591311088063",
  appId: "1:591311088063:web:5901dedb8e17f556f8590a"
};

try {
	const firebaseApp = initializeApp(firebaseConfig);
	const messaging = getMessaging(firebaseApp);
	
	onBackgroundMessage(messaging, (payload) => {
		console.log('[service-worker.js] Received background message ', payload);
		
		// If the payload contains a "notification" object, the Firebase SDK
		// automatically displays it. We return here to prevent duplicates.
		if (payload.notification) {
			return;
		}

		const notificationTitle = payload.data?.title || 'Checklist Alug';
		const notificationOptions = {
			body: payload.data?.body || '',
			icon: '/pwa_icon_512.png',
			data: payload.data
		};
	
		self.registration.showNotification(notificationTitle, notificationOptions);
	});
} catch (error) {
	console.error('Failed to initialize Firebase Messaging in Service Worker:', error);
}
