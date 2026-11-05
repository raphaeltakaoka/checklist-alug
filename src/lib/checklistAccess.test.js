import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadChecklistAccess } from './checklistAccess.js';
const user = { uid: 'inspector', getIdToken: vi.fn(async () => 'verified-token') };
const access = { accessVersion: 1, permissions: {
	'checklists.view': true, 'checklists.read': true, 'checklists.create': true, 'checklists.update': true
} };
let cache;
beforeEach(() => {
	cache = new Map();
	vi.stubGlobal('localStorage', {
		getItem: key => cache.get(key) || null, setItem: (key, value) => cache.set(key, value), removeItem: key => cache.delete(key)
	});
	vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(access))));
});
afterEach(() => vi.unstubAllGlobals());

describe('profile access in the browser', () => {
	it('loads current server grants and keeps only an owner-scoped offline cache', async () => {
		expect(await loadChecklistAccess(user, true)).toEqual(access);
		expect(fetch).toHaveBeenCalledWith('/api/auth/access', {
			headers: { authorization: 'Bearer verified-token' }, cache: 'no-store'
		});
		expect(await loadChecklistAccess(user, false)).toEqual(access);
		await expect(loadChecklistAccess({ ...user, uid: 'other' }, false)).rejects.toThrow('Conecte-se');
	});
	it('does not resurrect cached grants after explicit revocation', async () => {
		await loadChecklistAccess(user, true);
		fetch.mockResolvedValue(new Response('{}', { status: 403 }));
		await expect(loadChecklistAccess(user, true)).rejects.toThrow('Não foi possível');
		await expect(loadChecklistAccess(user, false)).rejects.toThrow('Conecte-se');
	});
	it('keeps existing drafts accessible during a network outage', async () => {
		await loadChecklistAccess(user, true);
		fetch.mockRejectedValue(new TypeError('offline'));
		expect(await loadChecklistAccess(user, true)).toEqual(access);
	});
});
