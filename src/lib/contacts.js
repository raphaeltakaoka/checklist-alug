export function normalizeContactName(value) {
	return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function contactNameMatches(name, query) {
	const normalized = normalizeContactName(name);
	const term = normalizeContactName(query);
	return !!term && (normalized.startsWith(term) || normalized.split(/\s+/).some(part => part.startsWith(term)));
}

export function linkInspectionContact(report, contact) {
	report.contactId = contact.id;
	report.clientUid = contact.uid || contact.id;
	report.clientName = contact.nome;
}

export function unlinkInspectionContact(report) {
	report.contactId = null;
	report.clientUid = null;
	report.clientName = '';
}
