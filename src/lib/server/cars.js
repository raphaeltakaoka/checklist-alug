import { ApiError } from '$lib/server/errors';
import { normalizePlate } from '$lib/cars.js';

export function validateCarId(id) {
	if (typeof id !== 'string' || !id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') {
		throw new ApiError(400, 'Selecione um veículo cadastrado.');
	}
	return id;
}

export function carSelection(snapshot) {
	if (!snapshot.exists) throw new ApiError(400, 'O veículo vinculado não existe mais. Selecione outro veículo.');
	const data = snapshot.data();
	const plate = normalizePlate(data.plate);
	if (!/^[A-Z0-9]{7}$/.test(plate)) throw new ApiError(400, 'O veículo precisa de uma placa válida no CRM.');
	return {
		id: snapshot.id, plate,
		make: typeof data.make === 'string' ? data.make : '',
		model: typeof data.model === 'string' ? data.model : ''
	};
}

export async function searchCars(db, input) {
	if (typeof input !== 'string' || input.length > 20) throw new ApiError(400, 'Informe uma placa válida.');
	const term = normalizePlate(input);
	if (term.length < 3) return [];
	if (term.length > 7) throw new ApiError(400, 'Informe até 7 caracteres da placa.');
	// CRM accepts both ABC1234 and ABC-1234. Both use the existing plate index.
	const prefixes = term.length > 3 ? [term, `${term.slice(0, 3)}-${term.slice(3)}`] : [term];
	const snapshots = await Promise.all(prefixes.map(prefix => db.collection('cars')
		.orderBy('plate').startAt(prefix).endAt(`${prefix}\uf8ff`).limit(10).get()));
	const cars = new Map();
	for (const snapshot of snapshots) {
		for (const document of snapshot.docs) {
			const plate = normalizePlate(document.data().plate);
			if (/^[A-Z0-9]{7}$/.test(plate) && plate.startsWith(term)) cars.set(document.id, carSelection(document));
		}
	}
	return [...cars.values()].sort((a, b) => a.plate.localeCompare(b.plate)).slice(0, 10);
}
