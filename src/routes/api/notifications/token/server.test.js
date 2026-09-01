import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: vi.fn() },
	adminDb: {}
}));

const { DELETE, POST } = await import('./+server.js');

describe('notification token endpoint', () => {
	for (const [method, handler] of [['POST', POST], ['DELETE', DELETE]]) {
		it(`returns 401 for an unauthenticated ${method} request`, async () => {
			const request = new Request('https://local.test/api/notifications/token', {
				method,
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ token: 'not-used-without-authentication' })
			});
			const response = await handler({ request });

			expect(response.status).toBe(401);
			await expect(response.json()).resolves.toEqual({ error: 'Authentication required.' });
		});
	}
});
