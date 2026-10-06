import { describe, expect, it, vi } from 'vitest';
import { contactSelection, searchContacts, validateContactId } from './contacts.js';

const document = (id, data) => ({ id, exists: true, data: () => data });
function database(pages) {
	const query = { where: vi.fn(), limit: vi.fn(), startAfter: vi.fn(), get: vi.fn() };
	query.where.mockReturnValue(query);
	query.limit.mockReturnValue(query);
	query.startAfter.mockReturnValue(query);
	for (const docs of pages) query.get.mockResolvedValueOnce({ docs });
	return { db: { collection: vi.fn(() => query) }, query };
}

describe('contact lookup', () => {
	it('does not query Firestore below three normalized characters', async () => {
		const { db } = database([]);
		expect(await searchContacts(db, ' á ')).toEqual([]);
		expect(db.collection).not.toHaveBeenCalled();
	});
	it('filters email-only matches and returns minimal data from every status', async () => {
		const { db, query } = database([[
			document('one', { nome: 'Márcia', uid: 'legacy', status: 'Lead', proposals: ['private'], email: 'marcia@example.test' }),
			document('two', { nome: 'João Martins', status: 'Cliente', telefone: '123' }),
			document('email', { nome: 'Pedro', email: 'mar@example.test' })
		]]);
		expect(await searchContacts(db, ' MAR ')).toEqual([
			{ id: 'one', uid: 'legacy', nome: 'Márcia', email: 'marcia@example.test', telefone: '' },
			{ id: 'two', uid: 'two', nome: 'João Martins', email: '', telefone: '123' }
		]);
		expect(query.where).toHaveBeenCalledWith('searchTokens', 'array-contains', 'mar');
	});
	it('reads another bounded page when tokens match other fields and caps results at ten', async () => {
		const unrelated = Array.from({ length: 30 }, (_, i) => document(`email-${i}`, { nome: 'Pedro' }));
		const matches = Array.from({ length: 15 }, (_, i) => document(`name-${i}`, { nome: 'Maria' }));
		const { db, query } = database([unrelated, matches]);
		expect(await searchContacts(db, 'mar')).toHaveLength(10);
		expect(query.startAfter).toHaveBeenCalledWith(unrelated.at(-1));
	});
	it('supports full names beyond the CRM prefix limit and verifies the complete name', async () => {
		const name = 'Maria Aparecida de Albuquerque';
		const { db, query } = database([[document('one', { nome: name })]]);
		expect(await searchContacts(db, name)).toHaveLength(1);
		expect(query.where).toHaveBeenCalledWith('searchTokens', 'array-contains', name.toLowerCase().slice(0, 25));
	});
	it('rejects removed or invalid contacts and unsafe IDs', () => {
		expect(() => contactSelection({ exists: false })).toThrow('não existe');
		expect(() => contactSelection(document('one', { nome: ' ' }))).toThrow('nome válido');
		for (const id of [null, '', '../other', '/', '.', '..']) expect(() => validateContactId(id)).toThrow();
	});
});
