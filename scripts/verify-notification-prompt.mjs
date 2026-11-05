// Isolated component smoke test; Firebase and notifications are mocked.
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import puppeteer from 'puppeteer-core';

const server = await createServer({
	configFile: false,
	root: process.cwd(),
	logLevel: 'silent',
	plugins: [
		{
			name: 'push-prompt-fixture',
			enforce: 'pre',
			resolveId(id) {
				if (id === '/push-main.js') return '\0push-main';
				if (id === '$app/env/public') return '\0push-env';
			},
			load(id) {
				if (id === '\0push-env') return "export const PUBLIC_FIREBASE_VAPID_KEY = 'fixture-key';";
				if (id === '\0push-main')
					return "import { mount } from 'svelte'; import Prompt from '/src/lib/components/PushNotificationPrompt.svelte'; import '/src/routes/layout.css'; mount(Prompt, { target: document.body });";
			},
			transform(code, id) {
				if (id.endsWith('/src/lib/notifications.js'))
					return "export const isPushSupported = async () => true; export async function enablePushNotifications() { window.pushCalls++; return 'fixture-device'; }";
				if (id.endsWith('/src/lib/ui.svelte.js')) return 'export const notify = () => {};';
			},
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					if (req.url?.split('?')[0] !== '/') return next();
					res.setHeader('Content-Type', 'text/html');
					res.end(
						'<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><script type="module" src="/push-main.js"></script></body></html>'
					);
				});
			}
		},
		tailwindcss(),
		svelte({ configFile: false })
	],
	resolve: { alias: { $lib: path.resolve('src/lib') } },
	server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }
});
let browser;
try {
	await server.listen();
	browser = await puppeteer.launch({
		executablePath:
			process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		headless: true
	});
	const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
	await mkdir('/tmp/checklist-push-prompt', { recursive: true });
	for (const width of [1440, 390]) {
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		page.setDefaultTimeout(10000);
		await page.setViewport({ width, height: 900 });
		const errors = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.evaluateOnNewDocument(() => {
			window.pushCalls = 0;
			Object.defineProperty(window, 'Notification', {
				value: {
					permission: new URL(location.href).searchParams.get('permission') || 'default'
				}
			});
			if (new URL(location.href).searchParams.has('optout'))
				localStorage.setItem('push_notifications_enabled', 'false');
		});
		await page.goto(origin, { waitUntil: 'networkidle0' });
		await page.waitForSelector('[aria-label="Ativar notificações"]');
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
			false
		);
		await page.screenshot({
			path: '/tmp/checklist-push-prompt/permission-' + width + '.png'
		});
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((b) => b.textContent.trim() === 'Agora não')
				.click()
		);
		await page.reload({ waitUntil: 'networkidle0' });
		assert.equal(await page.$('aside'), null);
		await page.evaluate(() => sessionStorage.clear());
		await page.reload({ waitUntil: 'networkidle0' });
		await page.waitForSelector('aside');
		await page.evaluate(() =>
			[...document.querySelectorAll('button')]
				.find((b) => b.textContent.trim() === 'Ativar notificações')
				.click()
		);
		await page.waitForSelector('aside', { hidden: true });
		assert.equal(await page.evaluate(() => window.pushCalls), 1);
		await page.goto(origin + '/?permission=granted', {
			waitUntil: 'networkidle0'
		});
		assert.equal(await page.$('aside'), null);
		assert.equal(await page.evaluate(() => window.pushCalls), 1);
		await page.goto(origin + '/?optout=1', { waitUntil: 'networkidle0' });
		assert.equal(await page.$('aside'), null);
		assert.equal(await page.evaluate(() => window.pushCalls), 0);
		assert.deepEqual(errors, []);
		await context.close();
	}
	console.log(
		'Checklist activation popup, dismiss, opt-out and silent registration passed on desktop/mobile. No real notifications sent.'
	);
} finally {
	await browser?.close();
	await server.close();
}
