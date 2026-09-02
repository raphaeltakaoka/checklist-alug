import { notify } from '$lib/ui.svelte.js';
import { app } from '$lib/firebase.js';
import { authenticatedFetch } from '$lib/api.js';

async function getMessagingModule() {
	return import('firebase/messaging');
}

/**
 * Checks if Push Notifications are supported on this device/browser
 */
export async function isPushSupported() {
	if (
		typeof window === 'undefined' ||
		!('serviceWorker' in navigator) ||
		!('Notification' in window)
	) {
		return false;
	}
	try {
		const { isSupported } = await getMessagingModule();
		return await isSupported();
	} catch {
		return false;
	}
}

/**
 * Checks if the app is currently running as an installed PWA
 */
export function isInstalledPWA() {
    return window.matchMedia('(display-mode: standalone)').matches || 
           window.matchMedia('(display-mode: fullscreen)').matches ||
           navigator.standalone === true;
}

/**
 * Requests Notification permission and retrieves the FCM token.
 * For iOS Safari, this MUST be called from an explicit user gesture (e.g., button click)
 * and the app MUST be installed as a PWA.
 * 
 * @param {string} userId - The current logged in user ID to save the token for.
 * @param {string} vapidKey - The Firebase Web Push certificate key.
 * @returns {Promise<string | null>} The FCM token if successful, null otherwise.
 */
export async function enablePushNotifications(vapidKey) {
    try {
        const supported = await isPushSupported();
        if (!supported) {
            console.warn("Push notifications are not supported by this browser.");
            notify("Notificações push não são suportadas neste navegador.");
            return null;
        }

        // On iOS Safari, web push is only available if added to home screen.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS && !isInstalledPWA()) {
            console.warn("On iOS, the app must be installed to the Home Screen to enable notifications.");
            notify("No iOS (iPhone/iPad), você deve adicionar este aplicativo à Tela de Início para habilitar as notificações. Clique no botão de compartilhar e selecione 'Adicionar à Tela de Início'.");
            return null;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
			const { getMessaging, getToken } = await getMessagingModule();
			const messaging = getMessaging(app);
            
            // Wait for service worker to be ready
            const registration = await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, { 
                vapidKey,
                serviceWorkerRegistration: registration 
            });

			if (currentToken) {
				await authenticatedFetch('/api/notifications/token', {
					method: 'POST',
					body: JSON.stringify({ token: currentToken })
				});
				return currentToken;
			} else {
				return null;
			}
		} else {
			return null;
        }
    } catch (error) {
        console.error("Error during notification permission request:", error);
        return null;
    }
}

/**
 * Disables push notifications for the current device.
 * Deletes the FCM token from FCM and removes it from the user's Firestore document.
 * 
 * @param {string} userId - The current logged in user ID.
 * @param {string} vapidKey - The Firebase Web Push certificate key.
 * @returns {Promise<boolean>} True if successful, false otherwise.
 */
export async function disablePushNotifications(vapidKey) {
    try {
        const supported = await isPushSupported();
        if (!supported) {
            return false;
        }

		const { deleteToken, getMessaging, getToken } = await getMessagingModule();
		const messaging = getMessaging(app);
        const registration = await navigator.serviceWorker.ready;
        const currentToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration
        });

		if (currentToken) {
			await authenticatedFetch('/api/notifications/token', {
				method: 'DELETE',
				body: JSON.stringify({ token: currentToken })
			});
			await deleteToken(messaging);
		}
        return true;
    } catch (error) {
        console.error("Error during disabling push notifications:", error);
        return false;
    }
}
