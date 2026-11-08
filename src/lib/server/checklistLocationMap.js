import { createHash } from 'node:crypto';
import * as env from '$app/env/private';
import { adminDb, adminStorage } from '$lib/server/admin';
import { isValidLocation, sameLocation } from '$lib/inspectionLocation.js';

const MAX_MAP_BYTES = 512 * 1024;
const PNG_SIGNATURE = Buffer.from('89504e470d0a1a0a', 'hex');

class MapResponseError extends Error {
	constructor(reason, status) {
		super(reason);
		this.status = status;
	}
}

function logMapFailure(stage, error) {
	// Provider and SDK errors may contain URLs, credentials or captured coordinates.
	const details = { stage };
	if (error instanceof MapResponseError) {
		details.reason = error.message;
		details.status = error.status;
	} else {
		details.reason = error?.name === 'TimeoutError' ? 'timeout' : 'request-failed';
		if (Number.isInteger(error?.code)) details.code = error.code;
	}
	console.warn('Checklist location map unavailable.', details);
}

function mapPath(ownerUid, id, location) {
	const hash = createHash('sha256')
		.update(JSON.stringify([location.latitude, location.longitude, location.capturedAt]))
		.digest('hex');
	return `checklist-location-maps/${ownerUid}/${id}/${hash}.png`;
}

async function fetchMap(location, apiKey) {
	const point = `lonlat:${location.longitude},${location.latitude}`;
	const params = new URLSearchParams({
		apiKey, style: 'osm-carto', width: '640', height: '320', zoom: '16', format: 'png',
		center: point, marker: `${point};color:#b91c1c;size:40`
	});
	const response = await fetch(`https://maps.geoapify.com/v1/staticmap?${params}`, {
		signal: AbortSignal.timeout(5000), redirect: 'error'
	});
	const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (!response.ok || contentType !== 'image/png' || !response.body) {
		await response.body?.cancel().catch(() => {});
		const reason = !response.ok ? 'http-error' : !response.body ? 'missing-body' : 'unexpected-image-format';
		throw new MapResponseError(reason, response.status);
	}
	let size = 0;
	const chunks = [];
	for await (const chunk of response.body) {
		size += chunk.byteLength;
		if (size > MAX_MAP_BYTES) throw new MapResponseError('image-too-large', response.status);
		chunks.push(chunk);
	}
	const image = Buffer.concat(chunks);
	if (!image.subarray(0, 8).equals(PNG_SIGNATURE)) throw new MapResponseError('invalid-png', response.status);
	return image;
}

export async function ensureChecklistLocationMap(detailRef, inspection) {
	const { location, ownerUid } = inspection;
	if (!isValidLocation(location)) return '';
	const path = mapPath(ownerUid, detailRef.id, location);
	if (!env.GEOAPIFY_API_KEY) return '';

	let stage = 'storage-exists';
	try {
		const file = adminStorage.bucket().file(path);
		if (!(await file.exists())[0]) {
			stage = 'geoapify';
			const image = await fetchMap(location, env.GEOAPIFY_API_KEY);
			stage = 'storage-save';
			try {
				await file.save(image, {
					resumable: false, contentType: 'image/png',
					preconditionOpts: { ifGenerationMatch: 0 }
				});
			} catch (error) {
				if (error.code !== 412) throw error;
			}
		}
		stage = 'firestore';
		const saved = await adminDb.runTransaction(async transaction => {
			const current = (await transaction.get(detailRef)).data();
			if (current?.ownerUid !== ownerUid || !sameLocation(current.location, location)) return false;
			if (current.location.mapImagePath !== path) transaction.update(detailRef, 'location.mapImagePath', path);
			return true;
		});
		if (!saved) {
			stage = 'storage-delete';
			await file.delete({ ignoreNotFound: true });
			return '';
		}
		return path;
	} catch (error) {
		logMapFailure(stage, error);
		throw error;
	}
}

export async function readChecklistLocationMap(id, inspection) {
	const { ownerUid, location } = inspection;
	if (!isValidLocation(location) || location.mapImagePath !== mapPath(ownerUid, id, location)) return null;
	try {
		const [image] = await adminStorage.bucket().file(location.mapImagePath).download();
		return image.byteLength <= MAX_MAP_BYTES && image.subarray(0, 8).equals(PNG_SIGNATURE) ? image : null;
	} catch (error) {
		logMapFailure('storage-download', error);
		throw error;
	}
}
