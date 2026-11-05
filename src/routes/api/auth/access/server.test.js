import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), get: vi.fn() }));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: { collection: name => ({ doc: id => ({ get: () => mocks.get(name, id) }) }) }
}));
const { GET } = await import('./+server.js');
const access = { schemaVersion: 1, active: true, profileId: 'base-operations', overrides: {} };
const permissions = { 'checklists.view': true, 'checklists.read': true, 'checklists.create': true, 'checklists.update': true };
const request = authorization => GET({ request: new Request('https://local.test/api/auth/access', {
	headers: authorization ? { authorization } : {}
}) });
beforeEach(() => {
	mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'inspector', email: 'private@example.test', roles: { operations: ['read'] } });
	mocks.get.mockReset().mockImplementation(async name => ({ exists: true, data: () => name === 'user_access'
		? access : { schemaVersion: 1, permissions } }));
});

describe('current Checklist access endpoint', () => {
	it('returns only effective permissions with shared caching disabled', async () => {
		const response = await request('Bearer fixture-token');
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const result = await response.json();
		expect(Object.keys(result).sort()).toEqual(['accessVersion', 'permissions']);
		expect(result.permissions).toMatchObject(permissions);
	});
	it('rejects missing authentication before reading policy and rejects inactive users', async () => {
		expect((await request()).status).toBe(401);
		expect(mocks.get).not.toHaveBeenCalled();
		mocks.get.mockResolvedValue({ exists: true, data: () => ({ ...access, active: false }) });
		expect((await request('Bearer fixture-token')).status).toBe(403);
	});
});
