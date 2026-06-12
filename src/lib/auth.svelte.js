import { auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

class AuthState {
	user = $state(null);
	loading = $state(true);
	roles = $state({});

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
						const hasAnyPermission = roles && Object.values(roles).some(roleArray => Array.isArray(roleArray) && roleArray.length > 0);

						if (!idTokenResult.claims || !hasAnyPermission) {
							console.warn("User does not have any permissions assigned. Denying access.");
							await auth.signOut();
							this.user = null;
							this.roles = {};
							localStorage.removeItem("authenticated");
							localStorage.removeItem("inspectorName");
							this.loading = false;
							return;
						}

						this.user = u;
						this.roles = roles;
						// Maintain local storage compatibility for other parts of the application
						localStorage.setItem("authenticated", "true");
						// Try to resolve display name or default to the local part of email
						const resolvedName = u.displayName || u.email.split("@")[0];
						localStorage.setItem("inspectorName", resolvedName);
					} catch (error) {
						console.error("Error during custom claims verification:", error);
						await auth.signOut();
						this.user = null;
						localStorage.removeItem("authenticated");
						localStorage.removeItem("inspectorName");
					}
				} else {
					this.user = null;
					this.roles = {};
					localStorage.removeItem("authenticated");
					localStorage.removeItem("inspectorName");
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
}

export const authState = new AuthState();
