import { ApiError } from '$lib/server/errors';
import { countDamages } from '$lib/inspection.js';

const PART_IDS = new Set([
	'front_bumper', 'hood', 'windshield', 'roof', 'rear_glass', 'trunk', 'rear_bumper',
	'left_fender', 'left_front_door', 'left_front_window', 'left_rear_door',
	'left_rear_window', 'left_rear_quarter', 'right_fender', 'right_front_door',
	'right_front_window', 'right_rear_door', 'right_rear_window', 'right_rear_quarter',
	'interior', 'left_front_wheel', 'right_front_wheel', 'left_rear_wheel',
	'right_rear_wheel'
]);
const STATUSES = new Set(['none', 'scratch', 'dent', 'crack', 'broken', 'damaged']);
const FUEL_LEVELS = new Set(['0/8', '1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8']);
const ALLOWED_FIELDS = new Set([
	'schemaVersion', 'id', 'ownerUid', 'licensePlate', 'inspectionType', 'inspectorName',
	'clientName', 'inspectionDateTime', 'clientLicensePhoto', 'clientLicensePhotoPath',
	'clientSignature', 'clientSignaturePath', 'carDiagramImage', 'carDiagramImagePath',
	'mileage', 'fuelLevel', 'hasDocument', 'hasChildSeat', 'hasEToll', 'partStates',
	'status', 'synced'
]);

function fail(message) {
	throw new ApiError(400, message);
}

function string(value, name, max, { required = true } = {}) {
	if (typeof value !== 'string' || value.length > max || (required && value.length === 0)) {
		fail(`Invalid ${name}.`);
	}
	return value;
}

function httpsUrl(value, name, required = true) {
	string(value, name, 2048, { required });
	if (!value && !required) return '';
	try {
		const url = new URL(value);
		if (url.protocol !== 'https:') fail(`Invalid ${name}.`);
		return url.href;
	} catch {
		fail(`Invalid ${name}.`);
	}
}

function storagePath(value, name, prefix, required = true) {
	string(value, name, 300, { required });
	if (!value && !required) return '';
	if (!value.startsWith(prefix) || value.includes('..')) fail(`Invalid ${name}.`);
	return value;
}

function cleanPartStates(value, prefix) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Invalid partStates.');
	const result = {};
	let totalPhotos = 0;
	for (const [partId, state] of Object.entries(value)) {
		if (!PART_IDS.has(partId) || !state || typeof state !== 'object' || Array.isArray(state)) {
			fail('Invalid inspection part.');
		}
		if (Object.keys(state).some((key) => !['status', 'comments', 'photos', 'photoPaths'].includes(key))) {
			fail('Unexpected inspection part field.');
		}
		if (!STATUSES.has(state.status)) fail('Invalid damage status.');
		const comments = string(state.comments ?? '', 'damage comments', 1000, { required: false });
		if (!Array.isArray(state.photos) || !Array.isArray(state.photoPaths)) fail('Invalid damage photos.');
		if (state.photos.length !== state.photoPaths.length || state.photos.length > 6) {
			fail('Invalid damage photo count.');
		}
		totalPhotos += state.photos.length;
		if (totalPhotos > 24) fail('Inspection contains too many photos.');
		result[partId] = {
			status: state.status,
			comments,
			photos: state.photos.map((url, index) => httpsUrl(url, `photo ${index}`)),
			photoPaths: state.photoPaths.map((path, index) =>
				storagePath(path, `photo path ${index}`, prefix)
			)
		};
	}
	return result;
}

export function validateChecklistPayload(payload, ownerUid) {
	if (!payload || typeof payload !== 'object' || Array.isArray(payload)) fail('Invalid inspection.');
	if (Object.keys(payload).some((key) => !ALLOWED_FIELDS.has(key))) fail('Unexpected inspection field.');
	if (payload.schemaVersion !== 2 || payload.ownerUid !== ownerUid) fail('Invalid inspection owner.');
	const id = string(payload.id, 'inspection ID', 128);
	if (!/^[A-Za-z0-9_-]+$/.test(id)) fail('Invalid inspection ID.');
	const prefix = `checklists/${ownerUid}/${id}/`;
	const inspectionDateTime = new Date(payload.inspectionDateTime);
	if (Number.isNaN(inspectionDateTime.getTime())) fail('Invalid inspection date.');
	if (!['Entrega', 'Retirada'].includes(payload.inspectionType)) fail('Invalid inspection type.');
	if (!FUEL_LEVELS.has(payload.fuelLevel)) fail('Invalid fuel level.');
	for (const field of ['hasDocument', 'hasChildSeat', 'hasEToll']) {
		if (typeof payload[field] !== 'boolean') fail(`Invalid ${field}.`);
	}
	if (payload.status !== 'completed' || payload.synced !== true) fail('Invalid sync status.');

	const report = {
		schemaVersion: 2,
		id,
		ownerUid,
		licensePlate: string(payload.licensePlate, 'license plate', 7).toUpperCase(),
		inspectionType: payload.inspectionType,
		inspectorName: string(payload.inspectorName, 'inspector name', 120),
		clientName: string(payload.clientName, 'client name', 200),
		inspectionDateTime,
		clientLicensePhoto: httpsUrl(payload.clientLicensePhoto, 'license photo'),
		clientLicensePhotoPath: storagePath(payload.clientLicensePhotoPath, 'license photo path', prefix),
		clientSignature: httpsUrl(payload.clientSignature, 'signature'),
		clientSignaturePath: storagePath(payload.clientSignaturePath, 'signature path', prefix),
		carDiagramImage: httpsUrl(payload.carDiagramImage || '', 'car diagram', false),
		carDiagramImagePath: storagePath(payload.carDiagramImagePath || '', 'car diagram path', prefix, false),
		mileage: string(payload.mileage ?? '', 'mileage', 20, { required: false }),
		fuelLevel: payload.fuelLevel,
		hasDocument: payload.hasDocument,
		hasChildSeat: payload.hasChildSeat,
		hasEToll: payload.hasEToll,
		partStates: cleanPartStates(payload.partStates, prefix),
		status: 'completed',
		synced: true
	};
	if (report.licensePlate.length !== 7) fail('Invalid license plate.');
	return report;
}

export function checklistSummary(report) {
	return {
		schemaVersion: 2,
		id: report.id,
		ownerUid: report.ownerUid,
		licensePlate: report.licensePlate,
		inspectionType: report.inspectionType,
		inspectorName: report.inspectorName,
		clientName: report.clientName,
		inspectionDateTime: report.inspectionDateTime,
		damageCount: countDamages(report.partStates),
		status: 'completed',
		createdAt: report.createdAt,
		updatedAt: report.updatedAt
	};
}

export function collectChecklistStoragePaths(report = {}) {
	const paths = [
		report.clientLicensePhotoPath,
		report.clientSignaturePath,
		report.carDiagramImagePath
	];
	for (const state of Object.values(report.partStates || {})) {
		if (Array.isArray(state?.photoPaths)) paths.push(...state.photoPaths);
	}
	return paths.filter((path) => typeof path === 'string' && path.length > 0);
}
