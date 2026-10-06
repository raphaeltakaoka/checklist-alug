import { describe, expect, it } from 'vitest';
import { contactNameMatches, linkInspectionContact, unlinkInspectionContact } from './contacts.js';
import { inspectionErrors, suggestSignatureName } from './inspectionForm.js';

describe('inspection contact and signer', () => {
	it('matches name and surname prefixes without accents, but not arbitrary substrings', () => {
		expect(contactNameMatches('João Martins', ' MAR ')).toBe(true);
		expect(contactNameMatches('João Martins', 'joa')).toBe(true);
		expect(contactNameMatches('Maria Silva', 'ari')).toBe(false);
		expect(contactNameMatches('Maria Silva', '')).toBe(false);
	});
	it('keeps the signer independent when linking and unlinking, including distinct UIDs', () => {
		const report = { schemaVersion: 3, clientSignatureName: 'Representante' };
		linkInspectionContact(report, { id: 'document-id', uid: 'historical-uid', nome: 'Maria' });
		expect(report).toMatchObject({ contactId: 'document-id', clientUid: 'historical-uid', clientName: 'Maria' });
		unlinkInspectionContact(report);
		expect(report).toMatchObject({ contactId: null, clientUid: null, clientName: '', clientSignatureName: 'Representante' });
	});
	it('suggests the signer once and never restores a deliberately cleared name', () => {
		const report = { clientName: 'Maria', clientSignatureName: '' };
		suggestSignatureName(report);
		expect(report.clientSignatureName).toBe('Maria');
		report.clientSignatureName = '';
		report.clientName = 'Outro cliente';
		suggestSignatureName(report);
		expect(report.clientSignatureName).toBe('');
	});
	it('requires a contact instead of typed text and the signer only at completion', () => {
		const report = { schemaVersion: 3, clientName: 'Nome manual', clientSignatureName: '   ' };
		expect(inspectionErrors(report, 1).clientName).toContain('Selecione');
		expect(inspectionErrors(report, 1).clientSignatureName).toBeUndefined();
		expect(inspectionErrors(report, 4).clientSignatureName).toBeTruthy();
		linkInspectionContact(report, { id: 'contact', nome: 'Maria' });
		expect(report.clientUid).toBe('contact');
		expect(inspectionErrors(report, 1).clientName).toBeUndefined();
		report.clientSignatureName = 'A'.repeat(201);
		expect(inspectionErrors(report, 4).clientSignatureName).toBeTruthy();
	});
});
