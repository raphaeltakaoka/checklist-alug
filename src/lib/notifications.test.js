import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	isSupported: vi.fn(),
	getToken: vi.fn(),
	getMessaging: vi.fn(),
	authenticatedFetch: vi.fn()
}));
vi.mock('$lib/firebase.js', () => ({ app: {} }));
vi.mock('$lib/ui.svelte.js', () => ({ notify: vi.fn() }));
vi.mock('$lib/api.js', () => ({
	authenticatedFetch: mocks.authenticatedFetch
}));
vi.mock('firebase/messaging', () => ({
	isSupported: mocks.isSupported,
	getToken: mocks.getToken,
	getMessaging: mocks.getMessaging
}));
import { enablePushNotifications } from './notifications.js';

let notification;
beforeEach(() => {
	vi.resetAllMocks();
	notification = {
		permission: 'default',
		requestPermission: vi.fn(async () => 'granted')
	};
	vi.stubGlobal('Notification', notification);
	vi.stubGlobal('window', { Notification: notification });
	vi.stubGlobal('navigator', {
		userAgent: 'Desktop browser',
		serviceWorker: { ready: Promise.resolve({}) }
	});
	mocks.isSupported.mockResolvedValue(true);
	mocks.getToken.mockResolvedValue('registered-device-token');
});
afterEach(() => vi.unstubAllGlobals());

describe('Checklist notification activation', () => {
	it('requests permission synchronously from the activation click before loading the SDK', async () => {
		const pending = enablePushNotifications('vapid-key');
		expect(notification.requestPermission).toHaveBeenCalledOnce();
		expect(mocks.isSupported).not.toHaveBeenCalled();
		expect(await pending).toBe('registered-device-token');
		expect(mocks.authenticatedFetch).toHaveBeenCalledWith('/api/notifications/token', {
			method: 'POST',
			body: JSON.stringify({ token: 'registered-device-token' })
		});
	});
	it('silently registers devices that are already authorized', async () => {
		notification.permission = 'granted';
		await enablePushNotifications('vapid-key');
		expect(notification.requestPermission).not.toHaveBeenCalled();
		expect(mocks.getToken).toHaveBeenCalledOnce();
	});
	it('does not register or request permission again when blocked', async () => {
		notification.permission = 'denied';
		expect(await enablePushNotifications('vapid-key')).toBeNull();
		expect(notification.requestPermission).not.toHaveBeenCalled();
		expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
	});
	it('does not register when the permission request is dismissed', async () => {
		notification.requestPermission.mockResolvedValue('default');
		expect(await enablePushNotifications('vapid-key')).toBeNull();
		expect(mocks.authenticatedFetch).not.toHaveBeenCalled();
	});
});
