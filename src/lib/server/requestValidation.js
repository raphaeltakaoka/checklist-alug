import { ApiError } from '$lib/server/errors';

export function assertExactObject(value, fields) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new ApiError(400, 'Invalid request body.');
	}
	const keys = Object.keys(value);
	if (keys.length !== fields.length || keys.some((key) => !fields.includes(key))) {
		throw new ApiError(400, 'Unexpected request field.');
	}
	return value;
}

export async function readJson(request) {
	try {
		return await request.json();
	} catch {
		throw new ApiError(400, 'Request body must be valid JSON.');
	}
}

export async function readExactJson(request, fields) {
	return assertExactObject(await readJson(request), fields);
}

export function boundedString(value, field, { min = 1, max, trim = true } = {}) {
	if (typeof value !== 'string') {
		throw new ApiError(400, `Invalid ${field}.`);
	}
	const result = trim ? value.trim() : value;
	if (result.length < min || result.length > max) {
		throw new ApiError(400, `${field} must be between ${min} and ${max} characters.`);
	}
	return result;
}
