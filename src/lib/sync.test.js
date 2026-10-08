import { beforeEach, describe, expect, it, vi } from 'vitest';

const getInspection = vi.fn();
const saveInspection = vi.fn();
const authenticatedFetch = vi.fn();

vi.mock('$lib/firebaseStorage.js', () => ({ storage: {} }));
vi.mock('$lib/db.js', () => ({ getInspection, saveInspection }));
vi.mock('$lib/api.js', () => ({ authenticatedFetch }));
vi.mock('firebase/storage', () => ({
	getDownloadURL: vi.fn(),
	ref: vi.fn(),
	uploadBytesResumable: vi.fn()
}));

const { __syncTestUtils, syncInspectionToCloud } = await import('./sync.js');

beforeEach(() => {
	getInspection.mockReset();
	saveInspection.mockReset().mockResolvedValue(undefined);
	authenticatedFetch.mockReset();
});

describe('inspection synchronization', () => {
	it('sends version 3 vehicle, contact and signer fields and preserves the server-resolved UID', async () => {
		const report = { id: 'ins-contact', ownerUid: 'owner-a', schemaVersion: 3, carId: 'car-id', contactId: 'doc-id', clientUid: 'old-uid', clientSignatureName: 'Representante', partStates: {}, signatureNameInitialized: true };
		getInspection.mockResolvedValue(report);
		authenticatedFetch.mockResolvedValue({ json: async () => ({ report: { ...report, clientUid: 'authoritative-uid' } }) });
		expect(await syncInspectionToCloud(report)).toMatchObject({ clientUid: 'authoritative-uid' });
		const payload = JSON.parse(authenticatedFetch.mock.calls[0][1].body);
		expect(payload).toMatchObject({ schemaVersion: 3, carId: 'car-id', contactId: 'doc-id', clientSignatureName: 'Representante' });
		expect(payload.signatureNameInitialized).toBeUndefined();
	});

	it.each([undefined, 2, 4])('rejects unsupported schema %s before uploading or writing to the cloud', async schemaVersion => {
		const report = { id: 'ins-unsupported', ownerUid: 'owner-a', schemaVersion, partStates: {} };
		getInspection.mockResolvedValue(report);
		await expect(syncInspectionToCloud(report)).rejects.toThrow('Unsupported inspection schema version.');
		expect(authenticatedFetch).not.toHaveBeenCalled();
		expect(saveInspection).not.toHaveBeenCalled();
	});
	it('never runs more than two upload jobs concurrently and preserves result order', async () => {
		let active = 0;
		let peak = 0;
		const tasks = Array.from({ length: 6 }, (_, index) => async () => {
			active += 1;
			peak = Math.max(peak, active);
			await new Promise((resolve) => setTimeout(resolve, 5));
			active -= 1;
			return index;
		});
		expect(await __syncTestUtils.runWithConcurrency(tasks, 2)).toEqual([0, 1, 2, 3, 4, 5]);
		expect(peak).toBe(2);
	});

	it('records retry metadata without losing queued media after a failed API write', async () => {
		const report = {
			schemaVersion: 3,
			id: 'ins-retry',
			ownerUid: 'owner-a',
			partStates: {},
			status: 'completed',
			retryCount: 2
		};
		getInspection.mockResolvedValue(report);
		authenticatedFetch.mockRejectedValue(new Error('network unavailable'));

		await expect(syncInspectionToCloud(report)).rejects.toThrow('network unavailable');
		expect(saveInspection).toHaveBeenLastCalledWith(
			expect.objectContaining({
				id: 'ins-retry',
				status: 'completed',
				syncState: 'error',
				synced: false,
				retryCount: 3,
				lastSyncError: 'network unavailable'
			})
		);
	});

	it('bounds part photos and normalizes unsafe comment values', () => {
		const photos = Array.from({ length: 9 }, (_, index) => `photo-${index}`);
		const result = __syncTestUtils.cleanPartStates({
			hood: { status: 'scratch', comments: 123, photos, photoPaths: photos }
		});
		expect(result.hood.photos).toHaveLength(6);
		expect(result.hood.photoPaths).toHaveLength(6);
		expect(result.hood.comments).toBe('123');
	});
});
