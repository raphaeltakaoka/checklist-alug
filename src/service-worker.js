/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
/// <reference types="@sveltejs/kit" />

import { build, files, version } from '$service-worker';

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

