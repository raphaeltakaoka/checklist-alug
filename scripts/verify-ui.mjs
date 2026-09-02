/** Local UI smoke test. Intercepts Firebase and HTTP APIs; never connects to production data.
 * Start Vite, then run: npm run test:ui
 * Optional: UI_BASE_URL, CHROME_PATH, UI_OUTPUT_DIR.
 */
import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.UI_BASE_URL || 'http://127.0.0.1:5173';
const output =
	process.env.UI_OUTPUT_DIR || '/private/tmp/checklist-ui-verification';
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname))
	throw new Error('UI tests may only target a local development server.');
await mkdir(output, { recursive: true });
const image = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
	'base64'
);
const imageFile = path.join(output, 'fixture-photo.png');
await writeFile(imageFile, image);
const ownerUid = 'ui-test-inspector';
const fixtureReport = {
	id: 'ui-synced',
	ownerUid,
	licensePlate: 'DEF4G56',
	clientName: 'Mariana Costa',
	inspectorName: 'Rafael Teste',
	inspectionType: 'Entrega',
	inspectionDateTime: '2026-09-02T10:30',
	createdAt: '2026-09-02T10:30:00.000Z',
	mileage: '32.400',
	fuelLevel: '6/8',
	hasDocument: true,
	hasChildSeat: false,
	hasEToll: true,
	clientLicensePhoto: 'https://ui-fixtures.invalid/license.png',
	clientSignature: 'https://ui-fixtures.invalid/signature.png',
	synced: true,
	syncState: 'synced',
	status: 'completed',
	damageCount: 1,
	partStates: {
		hood: {
			status: 'scratch',
			comments: 'Risco superficial no capô.',
			photos: ['https://ui-fixtures.invalid/hood.png'],
			photoPaths: [`checklists/${ownerUid}/ui-synced/parts/hood/0.png`]
		}
	}
};
const fixtureTasks = [
	{
		id: 'task-a',
		boardId: 'board-1',
		boardTitle: 'Entregas e Retiradas',
		title: 'Entrega — Mariana Costa',
		description:
			'Entregar o veículo na unidade Centro.\nConferir os documentos com a cliente.',
		columnName: 'Entrega',
		dueDateTime: '2026-09-02T15:00',
		files: [
			{
				name: 'Referência.png',
				type: 'image/png',
				url: 'https://ui-fixtures.invalid/task.png'
			},
			{
				name: 'Contrato.pdf',
				type: 'application/pdf',
				url: 'https://ui-fixtures.invalid/contract.pdf'
			}
		]
	},
	{
		id: 'task-b',
		boardId: 'board-1',
		boardTitle: 'Entregas e Retiradas',
		title: 'Retirada — Pedro Santos',
		description: 'Retirar o veículo na unidade Norte.',
		columnName: 'Retirada',
		dueDateTime: '2026-09-01T09:00',
		files: []
	}
];
const browser = await puppeteer.launch({
	executablePath:
		process.env.CHROME_PATH ||
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
	headless: true,
	args: ['--no-sandbox']
});
const page = await browser.newPage();
await page.setCacheEnabled(false);
await page.setBypassServiceWorker(true);
const errors = [];
const requests = [];
const moduleRequests = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.evaluateOnNewDocument(
	(report, tasks) => {
		window.__fixtureReport = report;
		window.__fixtureTasks = tasks;
		window.__failSaves = false;
		window.__failSync = true;
		window.__fixtureReads = [];
		Object.defineProperty(navigator, 'onLine', {
			configurable: true,
			get: () => !window.__offline
		});
	},
	fixtureReport,
	fixtureTasks
);
await page.setRequestInterception(true);
const json = (request, value, status = 200) =>
	request.respond({
		status,
		contentType: 'application/json',
		body: JSON.stringify(value)
	});
const js = (request, body) =>
	request.respond({ status: 200, contentType: 'application/javascript', body });
page.on('request', async (request) => {
	const url = new URL(request.url());
	if (url.pathname.includes('/src/lib/')) moduleRequests.push(url.pathname);
	if (url.protocol === 'data:' || url.protocol === 'blob:')
		return request.continue();
	if (url.hostname === 'ui-fixtures.invalid')
		return request.respond({
			status: 200,
			contentType: 'image/png',
			body: image
		});
	if (url.origin !== new URL(base).origin) return request.abort();
	if (url.pathname === '/src/lib/auth.svelte.js')
		return js(
			request,
			`export const authState = { loading: false, user: { uid: '${ownerUid}', email: 'inspetor@example.test' }, displayName: 'Rafael Teste', hasPermission: (group, action) => group === 'operations' && ['read','write','delete'].includes(action), canInspect: (action) => ['read','write','delete'].includes(action) };`
		);
	if (url.pathname === '/src/lib/firebase.js')
		return js(
			request,
			`export const app = {}; export const auth = { currentUser: { uid: '${ownerUid}', getIdToken: async () => 'fixture-token' } }; export const firebaseConfig = {};`
		);
	if (url.pathname === '/src/lib/firebaseDb.js')
		return js(request, 'export const db = {};');
	if (url.pathname === '/src/lib/firebaseStorage.js')
		return js(request, 'export const storage = {};');
	if (url.pathname === '/src/lib/notifications.js')
		return js(
			request,
			'export const isPushSupported = async () => false; export const enablePushNotifications = async () => null; export const disablePushNotifications = async () => true;'
		);
	if (url.pathname === '/src/lib/db.js' && !url.searchParams.has('ui-real'))
		return js(
			request,
			`export * from '/src/lib/db.js?ui-real'; import { saveInspection as save } from '/src/lib/db.js?ui-real'; export async function saveInspection(report) { if (window.__failSaves) throw new Error('Armazenamento de teste indisponível.'); return save(report); }`
		);
	if (url.pathname.includes('firebase_firestore.js'))
		return js(
			request,
			`
		export const collection = (_, name) => ({ name }); export const collectionGroup = collection;
		export const query = (target, ...constraints) => ({ ...target, constraints });
		export const where = (...args) => ({ where: args }); export const orderBy = (...args) => ({ orderBy: args }); export const limit = (n) => ({ limit: n }); export const startAfter = (cursor) => ({ cursor });
		export const doc = (_, collection, id) => ({ collection, id });
		export async function getDoc(ref) { return { exists: () => true, id: ref.id, data: () => ({ ...window.__fixtureReport, id: ref.id }) }; }
		export async function getDocs(q) {
			window.__fixtureReads.push(q); if(window.__offline) throw new Error('offline');
			const more = q.constraints.some(c => c.cursor);
			const records = q.name === 'cards' ? window.__fixtureTasks : more ? [{...window.__fixtureReport, id:'older-match', licensePlate:'ZZZ9Z99'}] : Array.from({length:20}, (_, i) => ({...window.__fixtureReport, id:'cloud-'+i}));
			const docs = records.map(record => ({id:record.id, data:() => record}));
			return {docs, size:docs.length, forEach:fn => docs.forEach(fn)};
		}`
		);
	if (url.pathname.includes('firebase_storage.js'))
		return js(
			request,
			`export const ref = (_, path) => ({path}); export const getDownloadURL = async ref => 'https://ui-fixtures.invalid/' + ref.path; export const uploadBytesResumable = (ref, blob) => ({snapshot:{ref}, on: (_, progress, error, complete) => setTimeout(complete, 5)});`
		);
	if (url.pathname.startsWith('/api/')) {
		requests.push({
			method: request.method(),
			path: url.pathname,
			body: request.postData() ? JSON.parse(request.postData()) : null
		});
		if (url.pathname === '/api/checklists/sync') {
			const fail = await page.evaluate(() => window.__failSync);
			if (fail)
				return json(request, { error: 'Falha de envio simulada.' }, 503);
			return json(request, { report: JSON.parse(request.postData()) });
		}
		if (url.pathname.endsWith('/photos'))
			return json(request, {
				partStates: {
					hood: {
						status: 'scratch',
						comments: 'Risco superficial no capô.',
						photos: [],
						photoPaths: []
					}
				}
			});
		return json(request, { success: true });
	}
	return request.continue();
});
const text = () => page.evaluate(() => document.body.innerText);
async function click(label, exact = true) {
	await page.waitForFunction(
		(label, exact) =>
			[...document.querySelectorAll('button, a')].some(
				(el) =>
					el.getClientRects().length &&
					(exact
						? el.textContent.trim() === label
						: el.textContent.includes(label))
			),
		{},
		label,
		exact
	);
	const buttons = await page.$$('button, a');
	for (const button of buttons) {
		const value = await button.evaluate((element) =>
			element.textContent.trim()
		);
		if (exact ? value === label : value.includes(label)) {
			await button.click();
			return;
		}
	}
	throw new Error(`Control not found: ${label}`);
}
async function waitText(value) {
	await page.waitForFunction(
		(s) =>
			document.body.textContent
				.toLocaleLowerCase()
				.includes(s.toLocaleLowerCase()),
		{},
		value
	);
}
async function screenshot(name, fullPage = false) {
	await page.screenshot({ path: path.join(output, name + '.png'), fullPage });
}
async function noOverflow() {
	assert.equal(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= innerWidth
		),
		true,
		'Page must fit viewport'
	);
}
async function captureAt(width, name) {
	await page.setViewport({
		width,
		height: width < 700 ? 844 : 900,
		deviceScaleFactor: 1
	});
	await noOverflow();
	await screenshot(name);
}
try {
	await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
	await page.goto(base + '/dashboard');
	await waitText('Nenhuma vistoria em andamento');
	await page.evaluate(async (report) => {
		const { saveInspection } = await import('/src/lib/db.js');
		await saveInspection({
			...report,
			id: 'ui-draft',
			licensePlate: 'ABC1D23',
			clientName: 'João Oliveira',
			status: 'draft',
			syncState: 'draft',
			synced: false,
			clientLicensePhoto: null,
			clientSignature: null
		});
		await saveInspection({
			...report,
			id: 'ui-pending',
			licensePlate: 'GHI7J89',
			clientName: 'Pedro Santos',
			status: 'completed',
			syncState: 'queued',
			synced: false
		});
		await saveInspection(report);
	}, fixtureReport);
	await page.reload();
	await waitText('Falha no envio');
	await captureAt(390, 'home-mobile');
	await captureAt(1440, 'home-desktop');
	await captureAt(360, 'home-small');
	console.log(
		'PASS home: draft, pending, sync failure, 360/390/1440px layouts'
	);
	await click('Nova vistoria');
	await waitText('Identifique o veículo');
	await click('Conclusão', false);
	await waitText('Informe os 7 caracteres');
	assert.equal(await page.evaluate(() => document.activeElement.id), 'plate');
	await page.type('#plate', 'xyz9a87');
	await page.type('#client', 'Cliente de Teste');
	await page.evaluate(() => {
		window.__failSaves = true;
	});
	await click('Continuar');
	await waitText('Armazenamento de teste indisponível.');
	assert((await text()).includes('Identifique o veículo'));
	await screenshot('form-save-error');
	await page.evaluate(() => {
		window.__failSaves = false;
	});
	await click('Continuar');
	await waitText('Quilometragem (km)');
	await click('Conclusão', false);
	await waitText('Informe a quilometragem');
	assert.equal(await page.evaluate(() => document.activeElement.id), 'mileage');
	await page.type('#mileage', '45678');
	await screenshot('form-interior-mobile');
	await click('Continuar');
	await waitText('Selecione uma peça');
	await screenshot('form-damage-mobile');
	await page.click('button[aria-pressed="false"]'); // Switch to parts list.
	await click('Capô', false);
	await waitText('Condição da peça');
	await click('Risco');
	await page.type('#damage-comments', 'Risco pequeno à esquerda.');
	const files = await page.$$('dialog input[type=file]');
	await files[1].uploadFile(imageFile);
	await waitText('1/6');
	await screenshot('damage-editor-mobile');
	await click('Salvar peça');
	await page.waitForFunction(() => !document.querySelector('dialog'));
	await click('Porta Diant. Esq.', false);
	await click('Amassado');
	await click('Cancelar');
	await waitText('Descartar alterações da peça?');
	await click('Descartar');
	await page.waitForFunction(() => !document.querySelector('dialog'));
	assert.notEqual(
		await page.evaluate(() => document.body.style.overflow),
		'hidden',
		'Discard restores page scrolling'
	);

	await click('Continuar');
	await waitText('Foto da CNH');
	await click('Concluir vistoria');
	await waitText('Adicione uma foto da CNH');
	const licenseFiles = await page.$$('input[type=file]');
	await licenseFiles[1].uploadFile(imageFile);
	await page.waitForSelector('img.upload-preview');
	const canvas = await page.$('canvas');
	await canvas.scrollIntoView();
	const rect = await canvas.boundingBox();
	await page.mouse.move(rect.x + 30, rect.y + 60);
	await page.mouse.down();
	await page.mouse.move(rect.x + 150, rect.y + 100, { steps: 12 });
	await page.mouse.up();
	await waitText('Assinatura registrada');
	await page.waitForFunction(
		() =>
			!document.body.textContent.includes(
				'Peça ao cliente para assinar antes de concluir.'
			)
	);
	await captureAt(390, 'form-conclusion-mobile');
	await page.evaluate(() => {
		window.__offline = true;
		dispatchEvent(new Event('offline'));
	});
	await click('Concluir vistoria');
	await waitText('Vistoria concluída e salva neste dispositivo');
	assert((await text()).includes('Você está offline'));
	const completed = await page.evaluate(async () =>
		(
			await (
				await import('/src/lib/db.js')
			).getAllInspections('ui-test-inspector')
		).find((r) => r.licensePlate === 'XYZ9A87')
	);
	assert.equal(completed.status, 'completed');
	assert.equal(completed.syncState, 'queued');
	await page.evaluate(() => {
		window.__failSync = false;
		window.__offline = false;
		dispatchEvent(new Event('online'));
	});
	await waitText('Nenhum envio pendente');
	const finalRecord = await page.evaluate(async () =>
		(
			await (
				await import('/src/lib/db.js')
			).getAllInspections('ui-test-inspector')
		).find((r) => r.licensePlate === 'XYZ9A87')
	);
	assert.equal(finalRecord.synced, true);
	assert.equal(finalRecord.status, 'synced');
	console.log(
		'PASS inspection: step validation, save error/retry, damage photo, CNH, signature, offline completion, real sync module against mocked storage/API'
	);
	await click('Histórico');
	await waitText('20 carregadas');
	await captureAt(1440, 'history-desktop');
	await page.type('input[type=search]', 'ZZZ9Z99');
	await waitText('Nenhuma vistoria encontrada');
	await click('Carregar mais vistorias');
	await waitText('ZZZ9Z99');
	await click('Neste dispositivo');
	await click('Limpar filtros');
	await waitText('XYZ9A87');
	await captureAt(390, 'history-local-mobile');
	await page.click('a[href="/dashboard/new?id=ui-draft"]');
	await waitText('Continuar vistoria');
	assert.equal(await page.$eval('#plate', (el) => el.value), 'ABC1D23');
	await click('Salvar e sair');
	await waitText('Olá, Rafael.');
	await page.goto(base + '/dashboard/new/ui-synced');
	await waitText('Laudo de vistoria');
	await captureAt(390, 'report-mobile');
	await page.emulateMediaType('print');
	await page.pdf({
		path: path.join(output, 'report-print.pdf'),
		format: 'A4',
		printBackground: true
	});
	await page.emulateMediaType('screen');
	await page.click('button[aria-label="Ampliar foto 1 de Capô"]');
	await click('Excluir foto');
	await click('Excluir');
	await page.waitForFunction(() => !document.querySelector('dialog'));
	assert.notEqual(
		await page.evaluate(() => document.body.style.overflow),
		'hidden',
		'Photo deletion restores page scrolling'
	);
	await page.click('button[aria-label="Excluir vistoria"]');
	await waitText('Excluir vistoria?');
	await click('Cancelar');
	await page.goto(base + '/dashboard/checklists/cloud-0');
	await waitText('Laudo de vistoria');
	await noOverflow();
	console.log(
		'PASS history: loaded-record search, pagination, local history, resume; shared local/cloud report, photo deletion and printable PDF'
	);
	await click('Tarefas');
	await waitText('Entrega — Mariana Costa');
	await captureAt(390, 'tasks-mobile');
	await click('Entrega — Mariana Costa', false);
	await waitText('Contrato.pdf');
	assert.equal(
		await page.$eval('dialog', (element) =>
			Math.round(element.getBoundingClientRect().width)
		),
		390,
		'Mobile sheet spans viewport'
	);
	await screenshot('task-details-mobile');
	assert.equal(
		await page.$eval('a.attachment', (el) => el.getAttribute('href')),
		'https://ui-fixtures.invalid/contract.pdf'
	);
	await click('Referência.png', false);
	await page.waitForFunction(
		() => document.querySelectorAll('dialog[open]').length === 2
	);
	await page.keyboard.press('Escape');
	await page.waitForFunction(
		() => document.querySelectorAll('dialog[open]').length === 1
	);
	await page.keyboard.press('Escape');
	await page.waitForFunction(() => !document.querySelector('dialog'));
	console.log(
		'PASS tasks: detail dialog, image preview, attachment link, nested Escape/focus handling'
	);
	assert.deepEqual(errors, [], 'No browser runtime errors');
	assert(
		requests.some(
			(r) => r.path === '/api/checklists/sync' && r.body?.schemaVersion === 2
		)
	);
	await writeFile(
		path.join(output, 'results.json'),
		JSON.stringify(
			{
				passed: true,
				browserErrors: errors,
				apiRequests: requests.map((r) => ({ method: r.method, path: r.path })),
				screenshots: output
			},
			null,
			2
		)
	);
	console.log(`UI verification passed. Artifacts: ${output}`);
} catch (error) {
	await screenshot('failure', true);
	console.error(await text());
	console.error({ moduleRequests, errors, url: page.url() });
	throw error;
} finally {
	await browser.close();
}
