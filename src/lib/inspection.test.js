import { describe, expect, it } from 'vitest';
import {
	buildChecklistSummary,
	countDamages,
	formatInspectionDateTime,
	formatMileage,
	safeAttachmentUrl
} from './inspection.js';

describe('inspection helpers', () => {
	it('counts only actual damage states and builds lightweight summaries', () => {
		const report = {
			id: 'one',
			ownerUid: 'owner',
			licensePlate: 'ABC1D23',
			inspectionType: 'Entrega',
			inspectorName: 'Ana',
			clientName: 'Cliente',
			inspectionDateTime: 'date',
			partStates: { hood: { status: 'scratch' }, roof: { status: 'none' } },
			createdAt: 'created',
			updatedAt: 'updated'
		};
		expect(countDamages(report.partStates)).toBe(1);
		expect(buildChecklistSummary(report)).toMatchObject({ damageCount: 1, ownerUid: 'owner' });
	});

	it('accepts only HTTPS attachment URLs', () => {
		expect(safeAttachmentUrl('https://example.com/file.pdf')).toBe('https://example.com/file.pdf');
		expect(safeAttachmentUrl('javascript:alert(1)')).toBe('');
		expect(safeAttachmentUrl('data:text/html,hello')).toBe('');
	});

	it('formats inspection dates and mileage consistently', () => {
		expect(formatMileage('123456')).toBe('123.456');
		expect(formatInspectionDateTime('invalid')).toBe('N/A');
		expect(formatInspectionDateTime('2026-08-31T15:30:00.000Z')).not.toBe('N/A');
	});
});
