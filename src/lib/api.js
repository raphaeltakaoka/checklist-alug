import { auth } from '$lib/firebase.js';

export async function authenticatedFetch(input, init = {}) {
	const user = auth.currentUser;
	if (!user) throw new Error('Authentication required.');

	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${await user.getIdToken()}`);
	if (init.body && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}

	const response = await fetch(input, { ...init, headers });
	if (!response.ok) {
		const payload = await response.json().catch(() => ({}));
		throw new Error(payload.error || `Request failed (${response.status}).`);
	}
	return response;
}
