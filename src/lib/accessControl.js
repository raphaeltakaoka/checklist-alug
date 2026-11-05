// Checklist's subset of the shared CRM permission identifiers.
export const PERMISSION_KEYS = [
	'checklists.view', 'checklists.read', 'checklists.create', 'checklists.update',
	'checklists.delete', 'checklists.pdf', 'checklists.all.read', 'checklists.all.update',
	'checklists.all.delete', 'checklists.all.pdf', 'contacts.read', 'fleet.vehicles.read',
	'notifications.send'
];

export function can(identity, key) {
	return PERMISSION_KEYS.includes(key) && identity?.permissions?.[key] === true;
}

export function effectivePermissions(access, profile) {
	if (access?.schemaVersion !== 1 || access.active !== true || !access.overrides ||
		typeof access.overrides !== 'object' || Array.isArray(access.overrides)) return {};
	return Object.fromEntries(PERMISSION_KEYS.map(key => [key,
		access.superadmin === true || (Object.hasOwn(access.overrides, key)
			? access.overrides[key] === true
			: profile?.schemaVersion === 1 && profile.permissions?.[key] === true)
	]));
}

export function legacyPermissions(identity) {
	const has = (department, action) => Array.isArray(identity?.roles?.[department]) &&
		identity.roles[department].includes(action);
	return Object.fromEntries(PERMISSION_KEYS.map(key => {
		const action = key.split('.').at(-1);
		const legacyAction = ['create', 'update'].includes(action) ? 'write' :
			['pdf', 'view'].includes(action) ? 'read' : action;
		const allowed = key === 'notifications.send' ? has('administrator', 'write') :
			key.startsWith('checklists.all.') ? has('administrator', legacyAction) :
			has('operations', legacyAction) || has('administrator', legacyAction);
		return [key, allowed];
	}));
}

export function canUseChecklist(identity) {
	return can(identity, 'checklists.view') &&
		(can(identity, 'checklists.read') || can(identity, 'checklists.all.read'));
}

export function canInspect(identity, action, all = false) {
	return can(identity, `checklists${all ? '.all' : ''}.${action === 'write' ? 'update' : action}`);
}
