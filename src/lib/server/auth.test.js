import { beforeEach, describe, expect, it, vi } from 'vitest';

const { verifyIdToken, policyGet } = vi.hoisted(() => ({ verifyIdToken: vi.fn(), policyGet: vi.fn() }));
vi.mock('$lib/server/admin', () => ({ adminAuth: { verifyIdToken }, adminDb: { collection: name => ({ doc: id => ({ get: () => policyGet(name, id) }) }) } }));

const { ApiError, canAccessInspection, requireAuth, requirePermission, requireNotificationPermission } = await import('./auth.js');

beforeEach(() => {
	verifyIdToken.mockReset();
	policyGet.mockReset().mockResolvedValue({ exists: false });
});

describe('server authentication and inspection authorization', () => {
	it('rejects missing and invalid bearer tokens', async () => {
		await expect(requireAuth(new Request('https://local.test'))).rejects.toMatchObject({
			status: 401
		});
		verifyIdToken.mockRejectedValueOnce(new Error('invalid'));
		await expect(
			requireAuth(
				new Request('https://local.test', { headers: { authorization: 'Bearer bad-token' } })
			)
		).rejects.toMatchObject({ status: 401 });
		expect(verifyIdToken).toHaveBeenCalledWith('bad-token', true);
	});

	it('uses only the verified UID for owner access and permits administrator-wide actions', () => {
		const report = { ownerUid: 'owner-a' };
		const owner = { uid: 'owner-a', roles: { operations: ['read', 'write', 'delete'] } };
		const other = { uid: 'owner-b', roles: { operations: ['read', 'write', 'delete'] } };
		const manager = { uid: 'manager', roles: { administrator: ['read', 'write', 'delete'] } };
		expect(canAccessInspection(owner, report, 'write')).toBe(true);
		expect(canAccessInspection(other, report, 'write')).toBe(false);
		expect(canAccessInspection(manager, report, 'delete')).toBe(true);
	});

	it('resolves the current profile instead of outdated token roles', async () => {
		verifyIdToken.mockResolvedValue({ uid: 'owner-a', roles: { operations: ['read'] } });
		policyGet.mockImplementation(async name => ({ exists: true, data: () => name === 'user_access'
			? { schemaVersion: 1, active: true, profileId: 'base-operations', overrides: {} }
			: { schemaVersion: 1, permissions: { 'checklists.create': true, 'checklists.update': true } } }));
		const identity = await requireAuth(new Request('https://local.test', { headers: { authorization: 'Bearer current-token' } }));
		expect(identity.permissions['checklists.create']).toBe(true);
		expect(canAccessInspection(identity, { ownerUid: 'owner-a' }, 'write')).toBe(true);
		expect(canAccessInspection(identity, { ownerUid: 'other' }, 'write')).toBe(false);
		policyGet.mockRejectedValueOnce(new Error('policy unavailable'));
		await expect(requireAuth(new Request('https://local.test', { headers: { authorization: 'Bearer current-token' } }))).rejects.toThrow('policy unavailable');
	});

	it('does not turn access to all checklists into notification administration', () => {
		expect(() => requireNotificationPermission({ accessVersion: 1, permissions: { 'checklists.all.update': true } })).toThrow(ApiError);
	});

	it('rejects a non-administrator notification sender', () => {
		expect(() => requirePermission({ roles: { operations: ['write'] } }, 'administrator', 'write'))
			.toThrow(ApiError);
	});
});
