import { adminDb } from '$lib/server/admin';
import { effectivePermissions, legacyPermissions } from '$lib/accessControl.js';

export async function resolveAccess(identity, db = adminDb) {
	const snapshot = await db.collection('user_access').doc(identity.uid).get();
	if (!snapshot.exists) {
		const state = await db.collection('access_control').doc('state').get();
		return { ...identity, accessVersion: 1, permissions:
			!state.exists || state.data()?.allowLegacy === true ? legacyPermissions(identity) : {} };
	}
	const access = snapshot.data();
	const validId = typeof access?.profileId === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(access.profileId);
	const profile = validId
		? await db.collection('access_profiles').doc(access.profileId).get()
		: null;
	return { ...identity, accessVersion: 1, permissions: effectivePermissions(access, profile?.data()) };
}
