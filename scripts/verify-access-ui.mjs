// Real AuthState and profile loader; synthetic Firebase identity and server grants only.
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname)) throw new Error('Local server required.');
const output = process.env.UI_OUTPUT_DIR || '/private/tmp/checklist-ui-verification';
await mkdir(output, { recursive: true });
const browser = await puppeteer.launch({
	executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true, args: ['--no-sandbox']
});
const page = await browser.newPage();
const errors = [];
let mode = 'editor';
let accessRequests = 0;
page.on('pageerror', error => errors.push(error.message));
await page.setCacheEnabled(false);
await page.setBypassServiceWorker(true);
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
await page.evaluateOnNewDocument(() => {
	Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => sessionStorage.getItem('access-offline') !== 'true' });
});
await page.setRequestInterception(true);
const js = (request, body) => request.respond({ status: 200, contentType: 'application/javascript', body });
page.on('request', async request => {
	const url = new URL(request.url());
	if (['data:', 'blob:'].includes(url.protocol)) return request.continue();
	if (url.origin !== new URL(base).origin) return request.abort();
	if (url.pathname === '/src/lib/firebase.js') return js(request, `
		const user = { uid: 'profile-ui-inspector', email: 'inspector@example.test', displayName: 'Inspetor',
			getIdToken: async () => 'fixture-token',
			getIdTokenResult: async () => ({ claims: { roles: { operations: ['read'] } } }) };
		export const app = {}; export const firebaseConfig = {};
		export const auth = { currentUser: user, signOut: async () => { auth.currentUser = null; window.__authCallback?.(null); } };
	`);
	if (url.pathname.includes('firebase_auth.js')) return js(request, `
		export function onAuthStateChanged(auth, callback) { window.__authCallback = callback; queueMicrotask(() => callback(auth.currentUser)); return () => {}; }
		export const signOut = auth => auth.signOut();
		export const signInWithEmailAndPassword = async auth => ({ user: auth.currentUser });
	`);
	if (url.pathname === '/src/lib/firebaseDb.js') return js(request, 'export const db = {};');
	if (url.pathname === '/src/lib/notifications.js') return js(request,
		'export const isPushSupported = async () => false; export const enablePushNotifications = async () => null; export const disablePushNotifications = async () => true;');
	if (url.pathname === '/api/auth/access') {
		accessRequests++;
		assert.equal(request.headers().authorization, 'Bearer fixture-token');
		return request.respond({ status: mode === 'denied' ? 403 : 200, contentType: 'application/json', body: JSON.stringify({
			accessVersion: 1, permissions: { 'checklists.view': true, 'checklists.read': true,
				'checklists.create': mode === 'editor', 'checklists.update': mode === 'editor' }
		}) });
	}
	if (url.pathname.startsWith('/api/')) return request.abort();
	return request.continue();
});

try {
	await page.goto(`${base}/dashboard`);
	await page.waitForSelector('a[href="/dashboard/new"]', { visible: true });
	await page.screenshot({ path: path.join(output, 'operations-profile-editor.png') });
	await page.click('a[href="/dashboard/new"]');
	await page.waitForSelector('#plate', { visible: true });
	assert.match(await page.evaluate(() => document.body.innerText), /Nova vistoria/);
	await page.evaluate(() => sessionStorage.setItem('access-offline', 'true'));
	const onlineRequests = accessRequests;
	await page.goto(`${base}/dashboard`);
	await page.waitForSelector('a[href="/dashboard/new"]', { visible: true });
	assert.equal(accessRequests, onlineRequests, 'Offline reload must use this account’s cached profile.');
	await page.evaluate(() => sessionStorage.removeItem('access-offline'));
	mode = 'reader';
	await page.reload();
	await page.waitForSelector('input[aria-label="Buscar rascunhos e vistorias pendentes"]');
	assert.equal(await page.$('a[href="/dashboard/new"]'), null);
	await page.goto(`${base}/dashboard/new`);
	await page.waitForFunction(() => document.body.innerText.includes('Seu perfil não permite criar vistorias.'));
	await page.click('a[href="/dashboard"]');
	await page.waitForSelector('input[aria-label="Buscar rascunhos e vistorias pendentes"]');
	mode = 'denied';
	await page.reload();
	await page.waitForSelector('#login-email');
	assert.equal(await page.evaluate(() => localStorage.getItem('checklist-access:v1:profile-ui-inspector')), null);
	assert.deepEqual(errors, []);
	console.log(JSON.stringify({ result: 'passed', scenarios: ['global-profile editor with old read-only token', 'new inspection form', 'offline profile reload', 'read-only profile', 'direct URL denial', 'revocation'], accessRequests, screenshot: path.join(output, 'operations-profile-editor.png') }));
} finally {
	await browser.close();
}
