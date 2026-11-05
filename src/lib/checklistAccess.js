import { canUseChecklist } from '$lib/accessControl.js';

// Only UI grants are cached for offline drafts; APIs always resolve current policy.
export async function loadChecklistAccess(user, online = navigator.onLine) {
	const cacheKey = `checklist-access:v1:${user.uid}`;
	const cached = () => {
		try {
			const value = JSON.parse(localStorage.getItem(cacheKey));
			return value?.accessVersion === 1 && canUseChecklist(value) ? value : null;
		} catch { return null; }
	};
	if (!online) {
		const access = cached();
		if (access) return access;
		throw new Error('Conecte-se à internet para verificar seu perfil de acesso.');
	}
	let response;
	try {
		response = await fetch('/api/auth/access', {
			headers: { authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store'
		});
	} catch (error) {
		const access = cached();
		if (access) return access;
		throw error;
	}
	if (!response.ok) {
		if ([401, 403].includes(response.status)) {
			try { localStorage.removeItem(cacheKey); } catch { /* Storage can be unavailable. */ }
		}
		throw new Error('Não foi possível verificar seu acesso ao Checklist.');
	}
	const access = await response.json();
	if (access.accessVersion !== 1 || !canUseChecklist(access)) {
		throw new Error('Esta conta não possui acesso ao Checklist.');
	}
	try { localStorage.setItem(cacheKey, JSON.stringify(access)); } catch { /* Online access still works. */ }
	return access;
}
