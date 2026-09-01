import { describe, expect, it } from 'vitest';
import { validateChecklistPayload } from './checklistValidation.js';

function validPayload(overrides = {}) {
	return {
		schemaVersion: 2,
		id: 'ins-valid',
		ownerUid: 'owner-a',
		licensePlate: 'ABC1D23',
		inspectionType: 'Entrega',
		inspectorName: 'Inspetor',
		clientName: 'Cliente',
		inspectionDateTime: '2026-08-31T12:00:00.000Z',
		clientLicensePhoto: 'https://storage.example/license.jpg',
		clientLicensePhotoPath: 'checklists/owner-a/ins-valid/license.jpg',
		clientSignature: 'https://storage.example/signature.png',
		clientSignaturePath: 'checklists/owner-a/ins-valid/signature.png',
		carDiagramImage: '',
		carDiagramImagePath: '',
		mileage: '10.000',
		fuelLevel: '4/8',
		hasDocument: true,
		hasChildSeat: false,
		hasEToll: false,
		partStates: {
			hood: {
				status: 'scratch',
				comments: 'Leve',
				photos: ['https://storage.example/hood.jpg'],
				photoPaths: ['checklists/owner-a/ins-valid/parts/hood/0.jpg']
			}
		},
		status: 'completed',
		synced: true,
		...overrides
	};
}

describe('checklist server validation', () => {
	it('accepts and normalizes a bounded owner-scoped report', () => {
		const report = validateChecklistPayload(validPayload(), 'owner-a');
		expect(report.licensePlate).toBe('ABC1D23');
		expect(report.partStates.hood.photos).toHaveLength(1);
	});

	it.each([
		['owner spoofing', { ownerUid: 'owner-b' }],
		['data URL', { clientLicensePhoto: 'data:image/jpeg;base64,AA==' }],
		['path traversal', { clientLicensePhotoPath: 'checklists/owner-a/../secret.jpg' }],
		['invalid status', { partStates: { hood: { status: 'hacked', comments: '', photos: [], photoPaths: [] } } }],
		['schema pollution', { extraData: 'forged' }]
	])('rejects %s', (_name, override) => {
		expect(() => validateChecklistPayload(validPayload(override), 'owner-a')).toThrow();
	});

	it('rejects mismatched and oversized photo lists', () => {
		const photos = Array.from({ length: 7 }, (_, index) => `https://storage.example/${index}.jpg`);
		const photoPaths = photos.map((_, index) =>
			`checklists/owner-a/ins-valid/parts/hood/${index}.jpg`
		);
		expect(() =>
			validateChecklistPayload(
				validPayload({
					partStates: { hood: { status: 'scratch', comments: '', photos, photoPaths } }
				}),
				'owner-a'
			)
		).toThrow();
	});
});
