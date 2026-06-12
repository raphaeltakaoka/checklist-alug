import { getMessaging, getToken, deleteToken, isSupported } from "firebase/messaging";
import { app, db } from "./firebase";
import { doc, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

/**
 * Checks if Push Notifications are supported on this device/browser
 */
export async function isPushSupported() {
    if (!('serviceWorker' in navigator) || !('Notification' in window)) {
        return false;
    }
    try {
        return await isSupported();
    } catch (e) {
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
export async function enablePushNotifications(userId, vapidKey) {
    try {
        const supported = await isPushSupported();
        if (!supported) {
            console.warn("Push notifications are not supported by this browser.");
            alert("Notificações push não são suportadas neste navegador.");
            return null;
        }

        // On iOS Safari, web push is only available if added to home screen.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS && !isInstalledPWA()) {
            console.warn("On iOS, the app must be installed to the Home Screen to enable notifications.");
            alert("No iOS (iPhone/iPad), você deve adicionar este aplicativo à Tela de Início para habilitar as notificações. Clique no botão de compartilhar e selecione 'Adicionar à Tela de Início'.");
            return null;
        }

        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            console.log('Notification permission granted.');
            
            const messaging = getMessaging(app);
            
            // Wait for service worker to be ready
            const registration = await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, { 
                vapidKey,
                serviceWorkerRegistration: registration 
            });

            if (currentToken) {
                console.log('FCM Token received:', currentToken);
                
                // Save token to Firestore user document
                if (userId) {
                    const userRef = doc(db, "users", userId);
                    await updateDoc(userRef, {
                        fcmTokens: arrayUnion(currentToken)
                    }).catch(err => {
                        console.error("Error saving token to user profile:", err);
                    });
                }
                
                return currentToken;
            } else {
                console.log('No registration token available. Request permission to generate one.');
                return null;
            }
        } else {
            console.log('Unable to get permission to notify.');
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
export async function disablePushNotifications(userId, vapidKey) {
    try {
        const supported = await isPushSupported();
        if (!supported) {
            return false;
        }

        const messaging = getMessaging(app);
        const registration = await navigator.serviceWorker.ready;
        const currentToken = await getToken(messaging, {
            vapidKey,
            serviceWorkerRegistration: registration
        });

        if (currentToken) {
            // Delete the token from FCM servers
            await deleteToken(messaging);
            console.log('FCM Token deleted successfully.');

            // Remove token from Firestore user document
            if (userId) {
                const userRef = doc(db, "users", userId);
                await updateDoc(userRef, {
                    fcmTokens: arrayRemove(currentToken)
                }).catch(err => {
                    console.error("Error removing token from user profile:", err);
                });
            }
        }
        return true;
    } catch (error) {
        console.error("Error during disabling push notifications:", error);
        return false;
    }
}
