import { describe, expect, it, vi } from 'vitest';
vi.mock('$lib/server/admin', () => ({ adminDb: {} }));
const { resolveAccess } = await import('./accessControl.js');
const { can, canUseChecklist } = await import('../accessControl.js');

const identity = { uid: 'inspector', roles: { operations: ['read', 'write', 'delete'] } };
const profile = { schemaVersion: 1, permissions: {
	'checklists.view': true, 'checklists.read': true, 'checklists.create': true, 'checklists.update': true
} };
const assignment = { schemaVersion: 1, active: true, profileId: 'base-operations', overrides: {} };
function database(documents) {
	return { collection: name => ({ doc: id => ({ get: async () => ({
		exists: Object.hasOwn(documents, `${name}/${id}`), data: () => documents[`${name}/${id}`]
	}) }) }) };
}
const resolve = (access = assignment, currentProfile = profile) => resolveAccess(identity, database({
	'user_access/inspector': access, 'access_profiles/base-operations': currentProfile
}));

describe('shared access profiles', () => {
	it('applies global profile edits to every assigned user without changing token claims', async () => {
		const db = database({ 'user_access/inspector': assignment, 'user_access/second': assignment,
			'access_profiles/base-operations': profile });
		for (const uid of ['inspector', 'second']) {
			const result = await resolveAccess({ uid, roles: { operations: ['read'] } }, db);
			expect(canUseChecklist(result)).toBe(true);
			expect(can(result, 'checklists.create')).toBe(true);
			expect(can(result, 'checklists.update')).toBe(true);
			expect(can(result, 'checklists.all.update')).toBe(false);
		}
	});
	it('preserves individual denials and never falls back to old claims for a migrated user', async () => {
		const result = await resolve({ ...assignment, overrides: { 'checklists.create': false } });
		expect(can(result, 'checklists.create')).toBe(false);
		expect(can(result, 'checklists.update')).toBe(true);
		expect(can(result, 'checklists.delete')).toBe(false);
	});
	it.each([
		{ ...assignment, active: false }, { ...assignment, schemaVersion: 2 },
		{ ...assignment, overrides: null }, { ...assignment, profileId: '../invalid' }
	])('fails closed for inactive or malformed assignments', async access => {
		const result = await resolve(access);
		expect(canUseChecklist(result)).toBe(false);
		expect(can(result, 'checklists.create')).toBe(false);
	});
	it('denies missing profiles and reflects a revoked grant on the next request', async () => {
		expect(can(await resolve(assignment, null), 'checklists.create')).toBe(false);
		expect(can(await resolve(assignment, {}), 'checklists.create')).toBe(false);
		expect(can(await resolve(assignment, { ...profile, permissions: {} }), 'checklists.create')).toBe(false);
	});
	it('only allows legacy claims when the shared migration state permits them', async () => {
		for (const allowLegacy of [true, false]) {
			const result = await resolveAccess(identity, database({ 'access_control/state': { allowLegacy } }));
			expect(canUseChecklist(result)).toBe(allowLegacy);
			expect(can(result, 'checklists.create')).toBe(allowLegacy);
		}
	});
});
