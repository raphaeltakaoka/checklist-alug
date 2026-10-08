import { describe, expect, it, vi } from 'vitest';
import { carSelection, searchCars, validateCarId } from './cars.js';
import { linkInspectionCar, normalizePlate, unlinkInspectionCar } from '$lib/cars.js';

const document = (id, data) => ({ id, exists: true, data: () => data });
function database(pages) {
	const query = { orderBy: vi.fn(), startAt: vi.fn(), endAt: vi.fn(), limit: vi.fn(), get: vi.fn() };
	for (const method of ['orderBy', 'startAt', 'endAt', 'limit']) query[method].mockReturnValue(query);
	for (const docs of pages) query.get.mockResolvedValueOnce({ docs });
	return { db: { collection: vi.fn(() => query) }, query };
}

describe('registered vehicle lookup', () => {
	it('does not query below three plate characters', async () => {
		const { db } = database([]);
		expect(await searchCars(db, ' a-b ')).toEqual([]);
		expect(db.collection).not.toHaveBeenCalled();
	});
	it('uses the plate index, strips separators and returns minimal fields', async () => {
		const { db, query } = database([[
			document('one', { plate: 'ABC-1234', make: 'Fiat', model: 'Argo', status: 'inactive', secret: 'private' }),
			document('invalid', { plate: 'ABC' }), document('other', { plate: 'DEF1234' })
		]]);
		expect(await searchCars(db, 'abc')).toEqual([{ id: 'one', plate: 'ABC1234', make: 'Fiat', model: 'Argo' }]);
		expect(query.orderBy).toHaveBeenCalledWith('plate');
		expect(query.startAt).toHaveBeenCalledWith('ABC');
		expect(query.endAt).toHaveBeenCalledWith('ABC\uf8ff');
		expect(query.limit).toHaveBeenCalledWith(10);
	});
	it('queries compact and hyphenated plates, deduplicates and caps at ten', async () => {
		const first = Array.from({ length: 10 }, (_, i) => document(`car-${i}`, { plate: `ABC1D${String(i).padStart(2, '0')}` }));
		const { db, query } = database([first, [first[0], document('extra', { plate: 'ABC-1D99' })]]);
		expect(await searchCars(db, 'abc-1d')).toHaveLength(10);
		expect(query.startAt.mock.calls).toEqual([['ABC1D'], ['ABC-1D']]);
	});
	it('rejects oversized input, removed vehicles, malformed plates and unsafe IDs', async () => {
		const { db } = database([]);
		await expect(searchCars(db, 'A'.repeat(21))).rejects.toThrow();
		await expect(searchCars(db, 'ABCDEFGH')).rejects.toThrow();
		expect(() => carSelection({ exists: false })).toThrow('não existe');
		expect(() => carSelection(document('one', { plate: 'ABC' }))).toThrow('placa válida');
		for (const id of [null, '', '../other', '/', '.', '..']) expect(() => validateCarId(id)).toThrow();
	});
	it('clears both the plate and document ID when unlinking', () => {
		const report = { clientName: 'Maria' };
		linkInspectionCar(report, { id: 'car-id', plate: 'abc-1d23' });
		expect(report).toMatchObject({ carId: 'car-id', licensePlate: 'ABC1D23' });
		unlinkInspectionCar(report);
		expect(report).toEqual({ carId: null, licensePlate: '', clientName: 'Maria' });
		expect(normalizePlate(null)).toBe('');
	});
});
