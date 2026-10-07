import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	createInspectionWriter,
	firstErrorStep,
	inspectionErrors
} from './inspectionForm.js';

const report = {
	schemaVersion: 3,
	licensePlate: 'ABC1D23',
	clientName: 'Cliente Teste',
	contactId: 'contact-test',
	clientSignatureName: 'Cliente Teste',
	inspectorName: 'Inspetor Teste',
	inspectionDateTime: '2026-09-02T10:00',
	mileage: '42.000',
	partStates: {},
	clientLicensePhoto: new Blob(['photo']),
	clientSignature: 'signature'
};
const deferred = () => {
	let resolve;
	let reject;
	const promise = new Promise((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
};

afterEach(() => vi.useRealTimers());

describe('inspection navigation validation', () => {
	it('checks all preceding steps when jumping forward', () => {
		const missingMileage = { ...report, mileage: '' };
		expect(inspectionErrors(missingMileage, 1)).toEqual({});
		expect(firstErrorStep(inspectionErrors(missingMileage, 3))).toBe(2);
		expect(
			firstErrorStep(
				inspectionErrors({ ...missingMileage, licensePlate: 'ABC' }, 4)
			)
		).toBe(1);
	});
	it('requires the CNH and signature only at completion', () => {
		const unsigned = {
			...report,
			clientLicensePhoto: null,
			clientSignature: null
		};
		expect(inspectionErrors(unsigned, 3)).toEqual({});
		expect(Object.keys(inspectionErrors(unsigned, 4))).toEqual([
			'clientLicensePhoto',
			'clientSignature'
		]);
		expect(inspectionErrors(report, 4)).toEqual({});
	});
	it('checks individual and total photo limits without requiring damage photos', () => {
		expect(
			inspectionErrors(
				{ ...report, partStates: { hood: { photos: Array(7) } } },
				4
			).partStates
		).toBeTruthy();
		const parts = Object.fromEntries(
			['a', 'b', 'c', 'd', 'e'].map((key) => [key, { photos: Array(5) }])
		);
		expect(
			inspectionErrors({ ...report, partStates: parts }, 4).partStates
		).toBeTruthy();
		delete parts.e;
		expect(inspectionErrors({ ...report, partStates: parts }, 4)).toEqual({});
	});
});

describe('inspection writer', () => {
	it('finishes an in-flight draft before completion and cancels pending autosave', async () => {
		vi.useFakeTimers();
		const first = deferred();
		const writes = [];
		const save = vi.fn(async (value) => {
			if (value.version === 1) await first.promise;
			writes.push(value);
		});
		const writer = createInspectionWriter(save);
		const draft = writer.flush({ status: 'draft', version: 1 });
		await Promise.resolve();
		writer.schedule(() => ({ status: 'draft', version: 2 }));
		const completion = writer.complete({ status: 'completed', version: 3 });
		writer.schedule(() => ({ status: 'draft', version: 4 }));
		await vi.advanceTimersByTimeAsync(1000);
		expect(writes).toHaveLength(0);
		first.resolve();
		await Promise.all([draft, completion]);
		await vi.runAllTimersAsync();
		expect(writes.map((value) => value.status)).toEqual(['draft', 'completed']);
		expect(writes.at(-1).version).toBe(3);
	});
	it('reports failed saves and allows a successful retry', async () => {
		const states = [];
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('Storage full'))
			.mockResolvedValue(undefined);
		const writer = createInspectionWriter(save, (state) => states.push(state));
		await expect(writer.flush(report)).rejects.toThrow('Storage full');
		expect(states.at(-1)).toBe('error');
		await writer.flush(report);
		expect(states.at(-1)).toBe('saved');
	});
	it('allows correction after completion fails, but prevents duplicate completion', async () => {
		const save = vi
			.fn()
			.mockRejectedValueOnce(new Error('Storage full'))
			.mockResolvedValue(undefined);
		const writer = createInspectionWriter(save);
		await expect(writer.complete({ status: 'completed' })).rejects.toThrow();
		await writer.flush({ status: 'draft' });
		await writer.complete({ status: 'completed' });
		await expect(writer.complete({ status: 'completed' })).rejects.toThrow();
		expect(save).toHaveBeenCalledTimes(3);
	});
	it('cancels autosave when required draft fields are cleared', async () => {
		vi.useFakeTimers();
		const save = vi.fn();
		const writer = createInspectionWriter(save);
		writer.schedule(() => report);
		writer.cancelScheduled();
		await vi.runAllTimersAsync();
		expect(save).not.toHaveBeenCalled();
	});

	it('does not run a delayed autosave after disposal', async () => {
		vi.useFakeTimers();
		const save = vi.fn();
		const writer = createInspectionWriter(save);
		writer.schedule(() => report);
		writer.dispose();
		await vi.runAllTimersAsync();
		expect(save).not.toHaveBeenCalled();
	});
});
