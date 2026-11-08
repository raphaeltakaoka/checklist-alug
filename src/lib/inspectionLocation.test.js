import { describe, expect, it, vi } from 'vitest';
import { createLocationCapture, googleMapsUrl, isValidLocation, sameLocation } from './inspectionLocation.js';

const location = { latitude: -23.55052, longitude: -46.633308, accuracy: 12, capturedAt: '2026-11-06T12:00:00.000Z' };
const position = { coords: location, timestamp: Date.parse(location.capturedAt) };

describe('inspection location', () => {
	it.each([
		null, undefined, [], {}, { ...location, latitude: 91 }, { ...location, latitude: -91 },
		{ ...location, longitude: 181 }, { ...location, longitude: -181 },
		{ ...location, latitude: NaN }, { ...location, longitude: Infinity },
		{ ...location, accuracy: -1 }, { ...location, accuracy: Infinity },
		{ ...location, latitude: '-23' }, { ...location, capturedAt: 'today' },
		{ ...location, capturedAt: '2026-02-30T12:00:00.000Z' },
		{ ...location, capturedAt: '2026-11-06' }, { ...location, address: 'manual' }
	])('rejects invalid location %j', value => {
		expect(isValidLocation(value)).toBe(false);
	});
	it('accepts geographic boundaries and shows low precision without imposing a threshold', () => {
		expect(isValidLocation({ ...location, latitude: -90, longitude: -180, accuracy: 0 })).toBe(true);
		expect(isValidLocation({ ...location, latitude: 90, longitude: 180, accuracy: 50_000 })).toBe(true);
		expect(sameLocation(location, { capturedAt: location.capturedAt, accuracy: 12, longitude: location.longitude, latitude: location.latitude })).toBe(true);
		expect(sameLocation(location, { ...location, accuracy: 13 })).toBe(false);
	});
	it('keeps captured coordinates stable after attaching a map', () => {
		expect(sameLocation(location, { ...location, mapImagePath: 'stored.png' })).toBe(true);
		expect(new URL(googleMapsUrl(location)).searchParams.get('query')).toBe('-23.55052,-46.633308');
	});
});

function setup() {
	const requests = [];
	const getCurrentPosition = vi.fn((success, error, options) => requests.push({ success, error, options }));
	const states = [];
	const capture = createLocationCapture(state => states.push(state), () => ({ getCurrentPosition }));
	return { capture, requests, states, getCurrentPosition };
}

describe('location capture lifecycle', () => {
	it('uses a fresh high-accuracy position and prevents concurrent requests', async () => {
		const { capture, requests, states, getCurrentPosition } = setup();
		const first = capture.capture();
		await capture.capture();
		expect(getCurrentPosition).toHaveBeenCalledTimes(1);
		expect(requests[0].options).toEqual({ enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
		requests[0].success(position);
		await first;
		expect(states).toEqual([{ status: 'loading', location: null, error: '' }, { status: 'success', location, error: '' }]);
	});
	it.each([[1, 'Permissão'], [2, 'indisponível'], [3, 'esgotou'], [0, 'válida']])('reports error %s and supports retry', async (code, message) => {
		const { capture, requests, states } = setup();
		const first = capture.capture();
		requests[0].error({ code });
		await first;
		expect(states.at(-1)).toMatchObject({ status: 'error', location: null, error: expect.stringContaining(message) });
		const retry = capture.capture();
		requests[1].success(position);
		await retry;
		expect(states.at(-1)).toMatchObject({ status: 'success', location });
	});
	it('handles unsupported browsers and invalid device positions', async () => {
		const onChange = vi.fn();
		await createLocationCapture(onChange, () => null).capture();
		expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'error', error: expect.stringContaining('navegador') }));
		const { capture, requests, states } = setup();
		const first = capture.capture();
		requests[0].success({ ...position, coords: { ...location, accuracy: -1 } });
		await first;
		expect(states.at(-1).status).toBe('error');
	});
	it('ignores a canceled result and serializes a fresh request when returning to the step', async () => {
		const { capture, requests, states, getCurrentPosition } = setup();
		const old = capture.capture();
		capture.cancel();
		const fresh = capture.capture();
		expect(getCurrentPosition).toHaveBeenCalledTimes(1);
		requests[0].success(position);
		await old;
		await Promise.resolve();
		expect(getCurrentPosition).toHaveBeenCalledTimes(2);
		expect(states.every(state => state.status === 'loading')).toBe(true);
		requests[1].success({ ...position, coords: { ...location, latitude: -22 } });
		await fresh;
		expect(states.at(-1).location.latitude).toBe(-22);
	});
	it('clears a prior success on recapture and ignores results after disposal', async () => {
		const { capture, requests, states, getCurrentPosition } = setup();
		const first = capture.capture();
		requests[0].success(position);
		await first;
		const second = capture.capture();
		expect(states.at(-1)).toMatchObject({ status: 'loading', location: null });
		capture.dispose();
		requests[1].error({ code: 1 });
		await second;
		await capture.capture();
		expect(getCurrentPosition).toHaveBeenCalledTimes(2);
		expect(states.at(-1).status).toBe('loading');
	});
});
