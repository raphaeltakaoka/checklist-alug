import { auth } from '$lib/firebase.js';
import { onAuthStateChanged } from 'firebase/auth';
import { canInspect, canUseChecklist } from '$lib/accessControl.js';
import { loadChecklistAccess } from '$lib/checklistAccess.js';

class AuthState {
	user = $state(null);
	loading = $state(true);
	permissions = $state({});
	displayName = $state('');
	error = $state('');
	request = 0;

	constructor() {
		if (typeof window === 'undefined') {
			this.loading = false;
			return;
		}
		onAuthStateChanged(auth, async (user) => {
			const request = ++this.request;
			this.loading = true;
			this.user = null;
			this.permissions = {};
			this.displayName = '';
			if (user) {
				this.error = '';
				try {
					const access = await loadChecklistAccess(user);
					if (request !== this.request) return;
					if (!canUseChecklist(access)) throw new Error('Esta conta não possui acesso ao Checklist.');
					this.permissions = access.permissions;
					this.user = user;
					this.displayName = user.displayName || user.email?.split('@')[0] || 'Inspetor';
				} catch (error) {
					if (request !== this.request) return;
					this.error = error.message || 'Não foi possível verificar seu perfil de acesso.';
					await auth.signOut();
				}
			}
			if (request === this.request) this.loading = false;
		});
	}

	hasPermission(roleGroup, permission) {
		return canInspect(this, permission, roleGroup === 'administrator');
	}

	canInspect(permission) {
		return canInspect(this, permission) || canInspect(this, permission, true);
	}
}

export const authState = new AuthState();
