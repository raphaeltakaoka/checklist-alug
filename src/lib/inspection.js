export const PART_NAMES = Object.freeze({
	front_bumper: 'Parachoque Dianteiro',
	hood: 'Capô',
	windshield: 'Parabrisa',
	roof: 'Teto',
	rear_glass: 'Vidro Traseiro',
	trunk: 'Porta-Malas / Traseira',
	rear_bumper: 'Parachoque Traseiro',
	left_fender: 'Paralama Diant. Esq.',
	left_front_door: 'Porta Diant. Esq.',
	left_front_window: 'Vidro Diant. Esq.',
	left_rear_door: 'Porta Tras. Esq.',
	left_rear_window: 'Vidro Tras. Esq.',
	left_rear_quarter: 'Lateral Tras. Esq.',
	right_fender: 'Paralama Diant. Dir.',
	right_front_door: 'Porta Diant. Dir.',
	right_front_window: 'Vidro Diant. Dir.',
	right_rear_door: 'Porta Tras. Dir.',
	right_rear_window: 'Vidro Tras. Dir.',
	right_rear_quarter: 'Lateral Tras. Dir.',
	interior: 'Interior da Cabine',
	left_front_wheel: 'Roda Diant. Esq.',
	right_front_wheel: 'Roda Diant. Dir.',
	left_rear_wheel: 'Roda Tras. Esq.',
	right_rear_wheel: 'Roda Tras. Dir.'
});

export const STATUS_LABELS = Object.freeze({
	none: 'Sem Danos',
	scratch: 'Risco',
	dent: 'Amassado',
	crack: 'Trincado',
	broken: 'Quebrado',
	damaged: 'Danificado'
});

export const STATUS_BADGE_STYLES = Object.freeze({
	scratch: 'text-amber-600 border-amber-400/50 bg-amber-50 print:text-amber-600 print:border-amber-400',
	dent: 'text-orange-600 border-orange-400/50 bg-orange-50 print:text-orange-600 print:border-orange-400',
	crack: 'text-purple-600 border-purple-400/50 bg-purple-50 print:text-purple-600 print:border-purple-400',
	broken: 'text-red-600 border-red-400/50 bg-red-50 print:text-red-600 print:border-red-400',
	damaged: 'text-indigo-600 border-indigo-400/50 bg-indigo-50 print:text-indigo-600 print:border-indigo-400'
});

export function countDamages(partStates = {}) {
	return Object.values(partStates).filter(
		(state) => state?.status && state.status !== 'none'
	).length;
}

export function formatInspectionDateTime(value) {
	if (!value) return 'N/A';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return 'N/A';
	return new Intl.DateTimeFormat('pt-BR', {
		dateStyle: 'short',
		timeStyle: 'short'
	}).format(date);
}

export function formatMileage(value) {
	const digits = String(value || '').replace(/\D/g, '');
	return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : '';
}

export function normalizeFirestoreDate(value) {
	if (!value) return '';
	if (typeof value.toDate === 'function') return value.toDate().toISOString();
	if (value.seconds != null) return new Date(value.seconds * 1000).toISOString();
	return value;
}

export function normalizeCloudInspection(data, id = data?.id) {
	if (!data) return null;
	return {
		...data,
		id,
		inspectionDateTime: normalizeFirestoreDate(data.inspectionDateTime),
		createdAt: normalizeFirestoreDate(data.createdAt),
		updatedAt: normalizeFirestoreDate(data.updatedAt)
	};
}

export function buildChecklistSummary(report) {
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

export function safeAttachmentUrl(value) {
	if (typeof value !== 'string') return '';
	try {
		const parsed = new URL(value);
		return parsed.protocol === 'https:' ? parsed.href : '';
	} catch {
		return '';
	}
}

export function safeFileName(value, fallback = 'arquivo') {
	const cleaned = String(value || '')
		.normalize('NFKD')
		.replace(/[^a-zA-Z0-9._-]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 100);
	return cleaned || fallback;
}
