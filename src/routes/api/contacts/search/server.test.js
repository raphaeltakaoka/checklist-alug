import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), get: vi.fn(), getDoc: vi.fn() }));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: { collection: () => ({ where: () => ({ limit: () => ({ get: mocks.get }) }), doc: () => ({ get: mocks.getDoc }) }) }
}));

const { GET } = await import('./+server.js');
const { GET: getContact } = await import('../[id]/+server.js');
function lookup(query = 'mar', authorization = 'Bearer token') {
	const url = new URL(`https://local.test/api/contacts/search?q=${encodeURIComponent(query)}`);
	return GET({ url, request: new Request(url, { headers: { authorization } }) });
}

beforeEach(() => {
	mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'inspector', roles: { operations: ['read'] } });
	mocks.get.mockReset().mockResolvedValue({ docs: [{ id: 'doc-id', exists: true, data: () => ({ nome: 'Maria', uid: 'legacy-uid', proposals: ['private'] }) }] });
	mocks.getDoc.mockReset().mockResolvedValue({ id: 'doc-id', exists: true, data: () => ({ nome: 'Maria' }) });
});

describe('delivery contact validation endpoint', () => {
	const lookupContact = (id = 'doc-id', authorization = 'Bearer token') => getContact({
		params: { id }, request: new Request('https://local.test/api/contacts/doc-id', { headers: { authorization } })
	});
	it('resolves the existing contact with a fallback UID', async () => {
		const response = await lookupContact();
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ contact: { id: 'doc-id', uid: 'doc-id', nome: 'Maria', email: '', telefone: '' } });
	});
	it('rejects unsafe references and unauthenticated access without reading contacts', async () => {
		expect((await lookupContact('../unsafe')).status).toBe(400);
		expect((await lookupContact('doc-id', '')).status).toBe(401);
		expect(mocks.getDoc).not.toHaveBeenCalled();
	});
	it('reports a removed contact instead of inventing a link', async () => {
		mocks.getDoc.mockResolvedValue({ exists: false });
		expect((await lookupContact()).status).toBe(400);
	});
});

describe('authenticated contact search endpoint', () => {
	it('rejects missing authentication and insufficient permissions without accessing contacts', async () => {
		expect((await lookup('mar', '')).status).toBe(401);
		mocks.verifyIdToken.mockResolvedValue({ uid: 'other', roles: { commercial: ['read'] } });
		expect((await lookup()).status).toBe(403);
		expect(mocks.get).not.toHaveBeenCalled();
	});
	it('permits administrators and returns only contact selection fields with no shared caching', async () => {
		mocks.verifyIdToken.mockResolvedValue({ uid: 'admin', roles: { administrator: ['read'] } });
		const response = await lookup();
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ contacts: [{ id: 'doc-id', uid: 'legacy-uid', nome: 'Maria', email: '', telefone: '' }] });
	});
	it('returns no results below three characters and rejects oversized input', async () => {
		expect(await (await lookup('ma')).json()).toEqual({ contacts: [] });
		expect((await lookup('a'.repeat(201))).status).toBe(400);
		expect(mocks.get).not.toHaveBeenCalled();
	});
});
