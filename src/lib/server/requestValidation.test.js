import { describe, expect, it } from 'vitest';
import { ApiError } from './errors.js';
import { assertExactObject, boundedString, readExactJson } from './requestValidation.js';

describe('privileged request validation', () => {
	it('rejects missing, extra, and prototype-spoofed request fields', () => {
		expect(() => assertExactObject({ token: 'valid' }, ['token'])).not.toThrow();
		expect(() => assertExactObject({ token: 'valid', uid: 'spoofed' }, ['token'])).toThrow(ApiError);
		expect(() => assertExactObject({}, ['token'])).toThrow(ApiError);
		expect(() => assertExactObject(null, ['token'])).toThrow(ApiError);
	});

	it('trims bounded text and rejects empty or oversized values', () => {
		expect(boundedString('  hello  ', 'title', { max: 10 })).toBe('hello');
		expect(() => boundedString(' ', 'title', { max: 10 })).toThrow(ApiError);
		expect(() => boundedString('12345678901', 'title', { max: 10 })).toThrow(ApiError);
	});

	it('maps malformed JSON to a client error', async () => {
		const request = new Request('https://local.test', { method: 'POST', body: '{' });
		await expect(readExactJson(request, ['token'])).rejects.toMatchObject({ status: 400 });
	});
});
