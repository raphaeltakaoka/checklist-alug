import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyIdToken: vi.fn(), read: vi.fn(), quota: vi.fn(), set: vi.fn(), update: vi.fn(),
	fetch: vi.fn(), sendMail: vi.fn(), audit: vi.fn()
}));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: {
		collection: collection => ({ doc: id => ({ get: () => mocks.read(collection, id) }), add: mocks.audit }),
		runTransaction: callback => callback({ get: mocks.quota, set: mocks.set, update: mocks.update })
	}
}));
vi.mock('$app/env/private', () => ({
	CRM_BASE_URL: 'https://crm.example.test', GMAIL_SMTP_USER: 'alug@example.test',
	GMAIL_SMTP_APP_PASSWORD: 'fake password', GMAIL_FROM_NAME: '', GMAIL_FROM_EMAIL: '', GMAIL_REPLY_TO: ''
}));
vi.mock('nodemailer', () => ({
	default: { createTransport: () => ({ sendMail: mocks.sendMail }) }
}));

const { GET, POST } = await import('./+server.js');
const owner = { uid: 'owner', roles: { operations: ['read'] } };
const inspection = { ownerUid: 'owner', licensePlate: 'ABC1D23', inspectionType: 'Interno' };
const input = { to: 'destinatario@example.test', subject: 'Laudo', message: 'Segue a vistoria.' };
const pdf = Buffer.from('%PDF-1.7\nsynthetic fixture');
let record;

function call(handler, body, authorization = 'Bearer fixture-token') {
	return handler({
		params: { id: 'inspection-1' },
		request: new Request('https://checklist.example.test/api/checklists/inspection-1/email', {
			method: body ? 'POST' : 'GET',
			headers: { authorization, 'content-type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined
		})
	});
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('fetch', mocks.fetch);
	record = { ...inspection };
	mocks.verifyIdToken.mockResolvedValue(owner);
	mocks.read.mockImplementation(async collection => {
		const data = { checklists: record, contacts: { email: ' cliente@example.test ' } }[collection];
		return { exists: !!data, data: () => data };
	});
	mocks.quota.mockResolvedValue({ data: () => undefined });
	mocks.fetch.mockImplementation(async () => new Response(pdf, { headers: { 'content-type': 'application/pdf' } }));
	mocks.sendMail.mockResolvedValue({ messageId: 'message-1' });
});
afterEach(() => vi.unstubAllGlobals());

describe('inspection e-mail', () => {
	it('loads the address from the linked contact when the inspection has no saved e-mail', async () => {
		record = { ...record, inspectionType: 'Entrega', contactId: 'contact-1' };
		const response = await call(GET);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ email: 'cliente@example.test' });
		expect(mocks.read).toHaveBeenCalledWith('contacts', 'contact-1');
	});

	it('uses a saved address and leaves unlinked inspections blank', async () => {
		expect(await (await call(GET)).json()).toEqual({ email: '' });
		record = { ...record, inspectionType: 'Entrega', contactId: 'contact-1', email: 'historico@example.test' };
		expect(await (await call(GET)).json()).toEqual({ email: 'historico@example.test' });
		expect(mocks.read).not.toHaveBeenCalledWith('contacts', 'contact-1');
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('generates the PDF in the CRM and sends an internal inspection to the typed address', async () => {
		expect((await call(POST, input)).status).toBe(200);
		expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith(
			new URL('https://crm.example.test/api/checklists/inspection-1/pdf'),
			expect.objectContaining({
				headers: { authorization: 'Bearer fixture-token', accept: 'application/pdf' }, redirect: 'error'
			})
		);
		expect(mocks.sendMail).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
			to: { name: '', address: input.to }, subject: input.subject, text: input.message,
			attachments: [{ filename: 'Checklist_Interno_ABC1D23.pdf', content: pdf, contentType: 'application/pdf' }]
		}));
		expect(mocks.audit).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
			checklistId: 'inspection-1', sentByUid: owner.uid, messageId: 'message-1', to: input.to
		}));
	});

	it('requires authentication, ownership or all-inspection access, and PDF permission', async () => {
		expect((await call(POST, input, '')).status).toBe(401);
		mocks.verifyIdToken.mockResolvedValue({ ...owner, uid: 'other-owner' });
		expect((await call(GET)).status).toBe(403);
		expect((await call(POST, input)).status).toBe(403);
		mocks.read.mockImplementation(async collection => {
			const data = {
				checklists: record,
				user_access: { schemaVersion: 1, active: true, overrides: { 'checklists.read': true } }
			}[collection];
			return { exists: !!data, data: () => data };
		});
		mocks.verifyIdToken.mockResolvedValue(owner);
		expect((await call(POST, input)).status).toBe(403);
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('rejects multiple recipients and stops at the shared quota before generating a PDF', async () => {
		expect((await call(POST, { ...input, to: 'a@example.test,b@example.test' })).status).toBe(400);
		mocks.quota.mockResolvedValue({ data: () => ({ count: 20, resetAt: Date.now() + 60_000 }) });
		const response = await call(POST, input);
		expect(response.status).toBe(429);
		expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0);
		expect(mocks.fetch).not.toHaveBeenCalled();
		expect(mocks.sendMail).not.toHaveBeenCalled();
	});

	it('does not send or audit if the CRM fails to generate a PDF', async () => {
		mocks.fetch.mockResolvedValueOnce(new Response('<html>Erro</html>', { status: 503 }));
		expect((await call(POST, input)).status).toBe(502);
		expect(mocks.sendMail).not.toHaveBeenCalled();
		expect(mocks.audit).not.toHaveBeenCalled();
	});
});
