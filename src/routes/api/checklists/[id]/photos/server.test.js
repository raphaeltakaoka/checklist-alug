import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	verifyIdToken: vi.fn(), policyGet: vi.fn(), get: vi.fn(), update: vi.fn(), set: vi.fn(), deleteFile: vi.fn(), file: vi.fn()
}));
vi.mock('$lib/server/admin', () => ({
	adminAuth: { verifyIdToken: mocks.verifyIdToken },
	adminDb: {
		collection: collection => ({ doc: id => ['user_access', 'access_control', 'access_profiles'].includes(collection)
			? { get: () => mocks.policyGet(collection, id) } : { collection, id } }),
		runTransaction: async callback => callback({ get: mocks.get, update: mocks.update, set: mocks.set })
	},
	adminStorage: { bucket: () => ({ file: mocks.file }) }
}));

const { DELETE } = await import('./+server.js');
const photoPath = 'checklists/owner-a/ins-glass/parts/windows_front/0.jpg';
const glass = {
	name: 'Parabrisa',
	status: 'crack', comments: 'Trinca no parabrisa',
	photos: ['https://example.test/glass-0.jpg', 'https://example.test/glass-1.jpg'],
	photoPaths: [photoPath, 'checklists/owner-a/ins-glass/parts/windows_front/1.jpg']
};
const partStates = { windows: { front: glass }, roof: { status: 'none', photos: [], photoPaths: [] } };
function remove(body = { partKey: 'windows_front', photoPath }, authorization = 'Bearer token') {
	return DELETE({ params: { id: 'ins-glass' }, request: new Request('https://local.test/api/checklists/ins-glass/photos', {
		method: 'DELETE', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify(body)
	}) });
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.policyGet.mockResolvedValue({ exists: false });
	mocks.verifyIdToken.mockResolvedValue({ uid: 'owner-a', roles: { operations: ['write'] } });
	mocks.get.mockResolvedValue({ exists: true, data: () => ({ ownerUid: 'owner-a', partStates }) });
	mocks.file.mockReturnValue({ delete: mocks.deleteFile });
});

describe('unified glass photo deletion', () => {
	it('removes a headlight photo without changing the glass photos', async () => {
		const path = 'checklists/owner-a/ins-glass/parts/headlights_left/0.jpg';
		const headlight = { name: 'Farol esquerdo', status: 'crack', photos: ['https://example.test/headlight.jpg'], photoPaths: [path] };
		mocks.get.mockResolvedValue({ exists: true, data: () => ({ ownerUid: 'owner-a', partStates: { ...partStates, headlights: { left: headlight } } }) });
		const response = await remove({ partKey: 'headlights_left', photoPath: path });
		expect(response.status).toBe(200);
		expect((await response.json()).partStates).toEqual({ ...partStates, headlights: { left: { ...headlight, photos: [], photoPaths: [] } } });
		expect(mocks.file).toHaveBeenCalledExactlyOnceWith(path);
	});
	it('removes only the selected glass photo and preserves the other photo and pieces', async () => {
		const response = await remove();
		expect(response.status).toBe(200);
		const expected = { ...partStates, windows: { front: { ...glass, photos: glass.photos.slice(1), photoPaths: glass.photoPaths.slice(1) } } };
		expect(await response.json()).toEqual({ success: true, partStates: expected });
		expect(mocks.update).toHaveBeenCalledWith({ collection: 'checklists', id: 'ins-glass' }, expect.objectContaining({ partStates: expected }));
		expect(mocks.file).toHaveBeenCalledExactlyOnceWith(photoPath);
		expect(mocks.deleteFile).toHaveBeenCalledExactlyOnceWith({ ignoreNotFound: true });
	});
	it.each(['windshield', 'rear_glass', 'left_front_window', 'left_rear_window', 'right_front_window', 'right_rear_window'])('rejects removed identifier %s', async partKey => {
		expect((await remove({ partKey, photoPath })).status).toBe(400);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.deleteFile).not.toHaveBeenCalled();
	});
	it('rejects unauthenticated deletion', async () => {
		expect((await remove(undefined, '')).status).toBe(401);
		expect(mocks.get).not.toHaveBeenCalled();
		expect(mocks.deleteFile).not.toHaveBeenCalled();
	});
	it.each([
		{ uid: 'other-owner', roles: { operations: ['write'] } },
		{ uid: 'owner-a', roles: { operations: ['read'] } }
	])('preserves owner and write-permission checks for %j', async identity => {
		mocks.verifyIdToken.mockResolvedValue(identity);
		expect((await remove()).status).toBe(403);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.deleteFile).not.toHaveBeenCalled();
	});
	it.each(['checklists/other-owner/ins-glass/parts/windows_front/0.jpg', 'checklists/owner-a/ins-glass/../private.jpg'])('rejects unsafe storage path %s', async path => {
		expect((await remove({ partKey: 'windows_front', photoPath: path })).status).toBe(400);
		expect(mocks.update).not.toHaveBeenCalled();
		expect(mocks.deleteFile).not.toHaveBeenCalled();
	});
});
