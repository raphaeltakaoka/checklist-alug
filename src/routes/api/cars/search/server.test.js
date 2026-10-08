import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), get: vi.fn(), getDoc: vi.fn() }));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: { collection: () => ({
		orderBy: () => ({ startAt: () => ({ endAt: () => ({ limit: () => ({ get: mocks.get }) }) }) }),
		doc: () => ({ get: mocks.getDoc })
	}) }
}));

const { GET } = await import('./+server.js');
const { GET: getCar } = await import('../[id]/+server.js');
function lookup(query = 'abc', authorization = 'Bearer token') {
	const url = new URL(`https://local.test/api/cars/search?q=${encodeURIComponent(query)}`);
	return GET({ url, request: new Request(url, { headers: { authorization } }) });
}
const lookupCar = (id = 'car-id', authorization = 'Bearer token') => getCar({
	params: { id }, request: new Request('https://local.test/api/cars/car-id', { headers: { authorization } })
});
const car = { id: 'car-id', exists: true, data: () => ({ plate: 'ABC-1D23', make: 'Fiat', model: 'Argo', private: 'secret' }) };
beforeEach(() => {
	mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'inspector', roles: { operations: ['read'] } });
	mocks.get.mockReset().mockResolvedValue({ docs: [car] });
	mocks.getDoc.mockReset().mockResolvedValue(car);
});

describe('authenticated car lookup endpoints', () => {
	it('requires authentication and operations or administration read permission', async () => {
		expect((await lookup('abc', '')).status).toBe(401);
		expect((await lookupCar('car-id', '')).status).toBe(401);
		mocks.verifyIdToken.mockResolvedValue({ uid: 'other', roles: { commercial: ['read'] } });
		expect((await lookup()).status).toBe(403);
		expect((await lookupCar()).status).toBe(403);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.getDoc).not.toHaveBeenCalled();
	});
	it('permits administrators and returns only selection fields without caching', async () => {
		mocks.verifyIdToken.mockResolvedValue({ uid: 'admin', roles: { administrator: ['read'] } });
		const response = await lookup();
		expect(response.headers.get('cache-control')).toBe('no-store');
		const fields = { id: 'car-id', plate: 'ABC1D23', make: 'Fiat', model: 'Argo' };
		expect(await response.json()).toEqual({ cars: [fields] });
		expect(await (await lookupCar()).json()).toEqual({ car: fields });
	});
	it('avoids reads for short queries or unsafe references and reports removed cars', async () => {
		expect(await (await lookup('ab')).json()).toEqual({ cars: [] });
		expect((await lookup('a'.repeat(21))).status).toBe(400);
		expect((await lookupCar('../unsafe')).status).toBe(400);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.getDoc).not.toHaveBeenCalled();
		mocks.getDoc.mockResolvedValue({ exists: false });
		expect((await lookupCar()).status).toBe(400);
	});
});
