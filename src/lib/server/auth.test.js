import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyIdToken = vi.fn();
vi.mock('$lib/server/admin', () => ({ adminAuth: { verifyIdToken } }));

const { ApiError, canAccessInspection, requireAuth, requirePermission } = await import('./auth.js');

beforeEach(() => verifyIdToken.mockReset());

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

	it('rejects a non-administrator notification sender', () => {
		expect(() => requirePermission({ roles: { operations: ['write'] } }, 'administrator', 'write'))
			.toThrow(ApiError);
	});
});
