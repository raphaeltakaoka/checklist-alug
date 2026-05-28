import { auth } from "./firebase.js";
import { onAuthStateChanged } from "firebase/auth";

class AuthState {
	user = $state(null);
	loading = $state(true);

	constructor() {
		if (typeof window !== "undefined") {
			onAuthStateChanged(auth, (u) => {
				this.user = u;
				this.loading = false;

				if (u) {
					// Maintain local storage compatibility for other parts of the application
					localStorage.setItem("authenticated", "true");
					// Try to resolve display name or default to the local part of email
					const resolvedName = u.displayName || u.email.split("@")[0];
					localStorage.setItem("inspectorName", resolvedName);
				} else {
					localStorage.removeItem("authenticated");
					localStorage.removeItem("inspectorName");
				}
			});
		} else {
			this.loading = false;
		}
	}
}

export const authState = new AuthState();
