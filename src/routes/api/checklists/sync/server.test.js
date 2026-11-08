import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ verifyIdToken: vi.fn(), getAll: vi.fn(), get: vi.fn(), set: vi.fn(), policyGet: vi.fn() }));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminStorage: {},
	adminDb: {
		collection: collection => ({ doc: id => ['user_access', 'access_control', 'access_profiles'].includes(collection)
			? { get: () => mocks.policyGet(collection, id) } : { collection, id } }),
		runTransaction: async callback => callback({ getAll: mocks.getAll, get: mocks.get, set: mocks.set })
	}
}));

vi.mock('$lib/server/checklistLocationMap.js', () => ({ ensureChecklistLocationMap: vi.fn().mockResolvedValue('') }));

const { POST } = await import('./+server.js');
const absent = { exists: false, data: () => undefined };
const document = (data, id = 'contact-id') => ({ id, exists: true, data: () => data });
const car = document({ plate: 'ABC-1D23', make: 'Fiat', model: 'Argo' }, 'car-id');
const withContact = contact => ref => ref.collection === 'cars' ? car : contact;
function payload(overrides = {}) {
	return {
		schemaVersion: 5, id: 'ins-valid', ownerUid: 'owner-a', licensePlate: 'ABC1D23', carId: 'car-id', inspectionType: 'Entrega',
		location: { latitude: -23.55052, longitude: -46.633308, accuracy: 12, capturedAt: '2026-11-06T12:00:00.000Z' },
		inspectorName: 'Inspetor', clientName: 'Maria', contactId: 'contact-id', clientUid: 'forged-uid', clientSignatureName: 'Representante',
		inspectionDateTime: '2026-10-06T12:00:00.000Z', clientLicensePhoto: 'https://example.test/license.jpg',
		clientLicensePhotoPath: 'checklists/owner-a/ins-valid/license.jpg', clientSignature: 'https://example.test/signature.png',
		clientSignaturePath: 'checklists/owner-a/ins-valid/signature.png', mileage: '1000', fuelLevel: '4/8',
		hasDocument: false, hasChildSeat: false, hasEToll: false, partStates: {}, status: 'completed', synced: true,
		...overrides
	};
}
function sync(body = payload(), authorization = 'Bearer token') {
	return POST({ request: new Request('https://local.test/api/checklists/sync', {
		method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body)
	}) });
}
beforeEach(() => {
	mocks.policyGet.mockReset().mockResolvedValue({ exists: false });
	mocks.verifyIdToken.mockReset().mockResolvedValue({ uid: 'owner-a', roles: { operations: ['write'] } });
	mocks.getAll.mockReset().mockResolvedValue([absent, absent]);
	mocks.get.mockReset().mockImplementation(withContact(document({ nome: 'Maria', uid: 'authoritative-uid' })));
	mocks.set.mockReset();
});

describe('shared profile permissions during sync', () => {
	function profile(permissions) {
		mocks.verifyIdToken.mockResolvedValue({ uid: 'owner-a', roles: { operations: ['read'] } });
		mocks.policyGet.mockImplementation(async name => ({ exists: true, data: () => name === 'user_access'
			? { schemaVersion: 1, active: true, profileId: 'base-operations', overrides: {} }
			: { schemaVersion: 1, permissions } }));
	}
	it('creates a checklist from the global profile despite read-only legacy claims', async () => {
		profile({ 'checklists.create': true, 'checklists.update': true });
		expect((await sync()).status).toBe(200);
	});
	it('separates create from update and rejects read-only profiles', async () => {
		profile({ 'checklists.read': true });
		expect((await sync()).status).toBe(403);
		profile({ 'checklists.update': true });
		expect((await sync()).status).toBe(403);
		profile({ 'checklists.create': true });
		mocks.getAll.mockResolvedValue([document({ schemaVersion: 5, ownerUid: 'owner-a' }), absent]);
		expect((await sync()).status).toBe(403);
		expect(mocks.set).not.toHaveBeenCalled();
	});
});

describe('catalog validation during checklist sync', () => {
  it('persists location only in the complete report and returns it unchanged', async () => {
    const response = await sync();
    expect(response.status).toBe(200);
    expect((await response.json()).report.location).toEqual(payload().location);
    expect(mocks.set.mock.calls[0][1].location).toEqual(payload().location);
    expect(mocks.set.mock.calls[1][1].location).toBeUndefined();
  });
  it('allows an idempotent retry with the same location regardless of field order', async () => {
    const previous = payload();
    previous.location = { capturedAt: previous.location.capturedAt, accuracy: 12, longitude: -46.633308, latitude: -23.55052 };
    mocks.getAll.mockResolvedValue([document(previous), absent]);
    expect((await sync()).status).toBe(200);
  });
  it.each([
    { latitude: -22 }, { longitude: -45 }, { accuracy: 13 }, { capturedAt: '2026-11-06T12:01:00.000Z' }
  ])('rejects changes to a synchronized location %j', change => {
    mocks.getAll.mockResolvedValue([document(payload()), absent]);
    return sync(payload({ location: { ...payload().location, ...change } })).then(async response => {
      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain('não pode ser alterada');
      expect(mocks.set).not.toHaveBeenCalled();
    });
  });
  it.each([null, undefined])('rejects removal of a synchronized location %j', async location => {
    mocks.getAll.mockResolvedValue([document(payload()), absent]);
    expect((await sync(payload({ location }))).status).toBe(400);
    expect(mocks.set).not.toHaveBeenCalled();
  });
	it('saves the registered car and canonical plate', async () => {
		const response = await sync();
		expect(response.status).toBe(200);
		expect(mocks.get).toHaveBeenCalledWith({ collection: 'cars', id: 'car-id' });
		expect((await response.json()).report).toMatchObject({ carId: 'car-id', licensePlate: 'ABC1D23' });
	});
	it('rejects a removed or forged vehicle without writing', async () => {
		mocks.get.mockImplementation(ref => ref.collection === 'cars' ? absent : document({ nome: 'Maria' }));
		expect((await sync(payload({ carId: 'nonexistent' }))).status).toBe(400);
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it('rejects a plate that does not belong to the selected car', async () => {
		const response = await sync(payload({ licensePlate: 'XYZ9A87' }));
		expect(response.status).toBe(400);
		expect((await response.json()).error).toContain('não corresponde');
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it.each([['authoritative-uid', { uid: 'authoritative-uid' }], ['contact-id', {}]])('resolves UID %s inside the transaction', async (uid, fields) => {
		mocks.get.mockImplementation(withContact(document({ nome: 'Maria', ...fields })));
		const response = await sync();
		expect(response.status).toBe(200);
		expect(mocks.get).toHaveBeenCalledWith({ collection: 'contacts', id: 'contact-id' });
		expect((await response.json()).report).toMatchObject({ clientUid: uid, clientSignatureName: 'Representante' });
		expect(mocks.set.mock.calls[0][1]).toMatchObject({ schemaVersion: 5, contactId: 'contact-id', clientUid: uid });
	});
	it('does not write an inspection linked to a removed contact', async () => {
		mocks.get.mockImplementation(withContact(absent));
		expect((await sync()).status).toBe(400);
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it('preserves ownership checks', async () => {
		mocks.getAll.mockResolvedValue([document({ schemaVersion: 5, ownerUid: 'other-user' }, 'ins-valid'), absent]);
		expect((await sync()).status).toBe(403);
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it.each([undefined, 2, 3, 4, 6])('rejects unsupported schema %s even for a new document', async schemaVersion => {
		const response = await sync(payload({ schemaVersion }));
		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({ error: 'Unsupported inspection schema version.' });
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.set).not.toHaveBeenCalled();
	});
	it('rejects unauthorized or incomplete version 5 writes', async () => {
		expect((await sync(payload(), '')).status).toBe(401);
		expect((await sync(payload({ clientSignatureName: ' ' }))).status).toBe(400);
		expect((await sync(payload({ contactId: null }))).status).toBe(400);
		expect((await sync(payload({ carId: null }))).status).toBe(400);
		expect(mocks.set).not.toHaveBeenCalled();
	});
});
