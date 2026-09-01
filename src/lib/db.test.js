import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
	__dbTestUtils,
	getAllInspections,
	getInspection,
	openDB,
	saveInspection
} from './db.js';

beforeEach(async () => {
	await __dbTestUtils.resetForTests();
});

function report(ownerUid, id, overrides = {}) {
	return {
		ownerUid,
		id,
		status: 'draft',
		createdAt: new Date().toISOString(),
		partStates: {},
		...overrides
	};
}

describe('owner-scoped inspection database', () => {
	it('deletes unowned version 1 records during the authorized upgrade', async () => {
		await new Promise((resolve, reject) => {
			const request = indexedDB.open(__dbTestUtils.DB_NAME, 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore('inspections', { keyPath: 'id' });
			};
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const database = request.result;
				const transaction = database.transaction('inspections', 'readwrite');
				transaction.objectStore('inspections').put({ id: 'legacy', status: 'draft' });
				transaction.oncomplete = () => {
					database.close();
					resolve();
				};
			};
		});

		const database = await openDB();
		expect(database.version).toBe(2);
		expect(await getAllInspections('owner-a')).toEqual([]);
	});

	it('isolates records belonging to different authenticated users', async () => {
		await saveInspection(report('owner-a', 'one'));
		await saveInspection(report('owner-b', 'two'));
		expect((await getAllInspections('owner-a')).map((item) => item.id)).toEqual(['one']);
		expect((await getAllInspections('owner-b')).map((item) => item.id)).toEqual(['two']);
		expect(await getInspection('owner-a', 'two')).toBeNull();
	});

	it('stores media as Blobs outside inspection metadata and hydrates it on detail reads', async () => {
		const photo = new Blob(['photo-bytes'], { type: 'image/jpeg' });
		await saveInspection(
			report('owner-a', 'media', {
				clientLicensePhoto: photo,
				partStates: {
					hood: { status: 'scratch', comments: '', photos: [photo] }
				}
			})
		);
		const listRecord = (await getAllInspections('owner-a'))[0];
		expect(listRecord.clientLicensePhoto).toBe('idb-media:clientLicensePhoto');
		const detail = await getInspection('owner-a', 'media');
		expect(detail.clientLicensePhoto).toMatch(/^data:image\/jpeg;base64,/);
		expect(detail.partStates.hood.photos[0]).toMatch(/^data:image\/jpeg;base64,/);
	});

	it('retains drafts while pruning only old synced history', async () => {
		await saveInspection(report('owner-a', 'draft-kept'));
		for (let index = 0; index < 51; index += 1) {
			await saveInspection(
				report('owner-a', `synced-${index}`, {
					status: 'synced',
					updatedAt: new Date(2026, 0, index + 1).toISOString()
				})
			);
		}
		const records = await getAllInspections('owner-a');
		expect(records.filter((item) => item.status === 'synced')).toHaveLength(50);
		expect(records.some((item) => item.id === 'draft-kept')).toBe(true);
	});
});
