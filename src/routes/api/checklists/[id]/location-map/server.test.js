import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	get: vi.fn(), update: vi.fn(), exists: vi.fn(), save: vi.fn(), download: vi.fn(),
	deleteFile: vi.fn(), file: vi.fn(), verifyIdToken: vi.fn(), fetch: vi.fn()
}));
vi.mock('$app/env/private', () => ({ GEOAPIFY_API_KEY: 'fixture-key' }));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: {
		collection: name => ({ doc: id => ({ id, get: name === 'checklists' ? mocks.get : async () => ({ exists: false }) }) }),
		runTransaction: callback => callback({ get: mocks.get, update: mocks.update })
	},
	adminStorage: { bucket: () => ({ file: mocks.file }) }
}));

const { GET, POST } = await import('./+server.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
let report;
function event(method) {
	return { params: { id: 'checklist-a' }, request: new Request('https://app.example.test/map', {
		method, headers: { authorization: 'Bearer token' }
	}) };
}

beforeEach(() => {
	vi.resetAllMocks();
	vi.stubGlobal('fetch', mocks.fetch);
	report = { ownerUid: 'owner-a', location: {
		latitude: -23.55, longitude: -46.63, accuracy: 10, capturedAt: '2026-11-08T12:00:00.000Z'
	} };
	mocks.get.mockImplementation(async () => ({ data: () => structuredClone(report) }));
	mocks.verifyIdToken.mockResolvedValue({ uid: 'owner-a', roles: { operations: ['read'] } });
	mocks.file.mockReturnValue({ exists: mocks.exists, save: mocks.save, download: mocks.download, delete: mocks.deleteFile });
	mocks.exists.mockResolvedValue([false]);
	mocks.download.mockResolvedValue([png]);
	mocks.update.mockImplementation((_ref, _field, path) => { report.location.mapImagePath = path; });
	mocks.fetch.mockImplementation(async () => new Response(png, { headers: { 'content-type': 'image/png' } }));
});
afterEach(() => vi.unstubAllGlobals());

it('stores one PNG at the captured point and reuses it for later authorized reads', async () => {
	const response = await POST(event('POST'));
	expect(response.status).toBe(200);
	expect(response.headers.get('cache-control')).toBe('private, no-store');
	expect(Buffer.from(await response.arrayBuffer())).toEqual(png);
	const url = new URL(mocks.fetch.mock.calls[0][0]);
	expect(url.hostname).toBe('maps.geoapify.com');
	expect(url.searchParams.get('center')).toBe('lonlat:-46.63,-23.55');
	expect(url.searchParams.get('marker')).toContain('lonlat:-46.63,-23.55');
	expect(report.location.mapImagePath).toMatch(/^checklist-location-maps\/owner-a\/checklist-a\/[a-f0-9]{64}\.png$/);
	expect(mocks.save).toHaveBeenCalledWith(png, expect.objectContaining({ preconditionOpts: { ifGenerationMatch: 0 } }));
	expect((await GET(event('GET'))).status).toBe(200);
	mocks.exists.mockResolvedValue([true]);
	expect((await POST(event('POST'))).status).toBe(200);
	expect(mocks.fetch).toHaveBeenCalledTimes(1);
});

it('keeps coordinates available when the provider fails and permits a later retry', async () => {
	mocks.fetch.mockResolvedValueOnce(new Response('quota', { status: 429 }));
	expect((await POST(event('POST'))).status).toBe(503);
	expect(report.location).toMatchObject({ latitude: -23.55, longitude: -46.63 });
	expect(report.location).not.toHaveProperty('mapImagePath');
	expect(mocks.save).not.toHaveBeenCalled();
	expect((await POST(event('POST'))).status).toBe(200);
});

it('rejects an unrelated account before requesting or serving the image', async () => {
	mocks.verifyIdToken.mockResolvedValue({ uid: 'other-owner', roles: { operations: ['read'] } });
	expect((await POST(event('POST'))).status).toBe(403);
	expect((await GET(event('GET'))).status).toBe(403);
	expect(mocks.fetch).not.toHaveBeenCalled();
	expect(mocks.file).not.toHaveBeenCalled();
});
