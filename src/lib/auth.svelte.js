import { auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

class AuthState {
	user = $state(null);
	loading = $state(true);
	roles = $state({});
	displayName = $state('');

	constructor() {
		if (typeof window !== "undefined") {
			onAuthStateChanged(auth, async (u) => {
				if (u) {
					try {
						// Retrieve the latest custom claims.
						// If online, force refresh to get latest roles.
						// If offline, use cached token to prevent auth failures when offline.
						let idTokenResult;
						if (typeof navigator !== "undefined" && navigator.onLine) {
							try {
								idTokenResult = await u.getIdTokenResult(true);
							} catch (e) {
								console.warn("Network error during claims refresh, using cached claims:", e);
								idTokenResult = await u.getIdTokenResult(false);
							}
						} else {
							idTokenResult = await u.getIdTokenResult(false);
						}
						
						const roles = idTokenResult.claims.roles;
						const canUseChecklist =
							(Array.isArray(roles?.operations) && roles.operations.includes('read')) ||
							(Array.isArray(roles?.administrator) && roles.administrator.includes('read'));

						if (!canUseChecklist) {
							console.warn("User does not have Checklist read permission. Denying access.");
							await auth.signOut();
							this.user = null;
							this.roles = {};
							this.displayName = '';
							this.loading = false;
							return;
						}

						this.user = u;
						this.roles = roles;
						this.displayName = u.displayName || u.email?.split('@')[0] || 'Inspetor';
					} catch (error) {
						console.error("Error during custom claims verification:", error);
						await auth.signOut();
						this.user = null;
						this.roles = {};
						this.displayName = '';
					}
				} else {
					this.user = null;
					this.roles = {};
					this.displayName = '';
				}
				this.loading = false;
			});
		} else {
			this.loading = false;
		}
	}

	hasPermission(roleGroup, permission) {
		return Array.isArray(this.roles[roleGroup]) && this.roles[roleGroup].includes(permission);
	}

	canInspect(permission) {
		return this.hasPermission('administrator', permission) || this.hasPermission('operations', permission);
	}
}

export const authState = new AuthState();
