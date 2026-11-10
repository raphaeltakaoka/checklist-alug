import { json } from '@sveltejs/kit';
import { adminDb } from '$lib/server/admin';
import { ApiError, apiErrorResponse, assertInspectionAccess, requireAuth } from '$lib/server/auth';
import { boundedString, readExactJson } from '$lib/server/requestValidation';
import {
	emailSettings, loadCrmPdf, sendChecklistEmail, takeEmailQuota, validEmail
} from '$lib/server/checklistEmail';

const noStore = { 'cache-control': 'no-store' };

async function authorize(request, id) {
	const identity = await requireAuth(request);
	if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
		throw new ApiError(400, 'ID de vistoria inválido.');
	}
	const inspection = (await adminDb.collection('checklists').doc(id).get()).data();
	if (!inspection) throw new ApiError(404, 'Vistoria não encontrada.');
	assertInspectionAccess(identity, inspection, 'read');
	assertInspectionAccess(identity, inspection, 'pdf');
	return { identity, inspection };
}

export async function GET({ request, params }) {
	try {
		const { inspection } = await authorize(request, params.id);
		let email = [inspection.clientEmail, inspection.email]
			.map(value => typeof value === 'string' ? value.trim() : '')
			.find(validEmail);
		const { contactId } = inspection;
		if (!email && typeof contactId === 'string' && contactId.length <= 1500 &&
			contactId && !contactId.includes('/') && contactId !== '.' && contactId !== '..') {
			const contact = (await adminDb.collection('contacts').doc(contactId).get()).data();
			const linkedEmail = typeof contact?.email === 'string' ? contact.email.trim() : '';
			if (validEmail(linkedEmail)) email = linkedEmail;
		}
		return json({ email: email || '' }, { headers: noStore });
	} catch (error) {
		return apiErrorResponse(error);
	}
}

export async function POST({ request, params }) {
	try {
		const { identity, inspection } = await authorize(request, params.id);
		const body = await readExactJson(request, ['to', 'subject', 'message']);
		const to = boundedString(body.to, 'e-mail', { max: 254 });
		if (!validEmail(to)) throw new ApiError(400, 'Informe um e-mail de destinatário válido.');
		const subject = boundedString(body.subject, 'assunto', { max: 200 });
		if (/[\r\n]/.test(subject)) throw new ApiError(400, 'Informe um assunto em uma única linha.');
		const message = boundedString(body.message, 'mensagem', { max: 20_000 });
		const settings = emailSettings();
		const retryAfter = await takeEmailQuota(identity.uid);
		if (retryAfter) {
			return json({ error: 'Limite de envios atingido. Tente novamente mais tarde.' }, {
				status: 429, headers: { ...noStore, 'retry-after': String(retryAfter) }
			});
		}
		const authorization = request.headers.get('authorization').replace(/^Bearer\s+/i, 'Bearer ');
		const pdf = await loadCrmPdf(settings.crm, params.id, authorization);
		const { messageId } = await sendChecklistEmail(settings, inspection, pdf, { to, subject, message });
		try {
			await adminDb.collection('email_logs').add({
				to, subject, recipientName: inspection.clientName || null,
				sentByUid: identity.uid, sentByName: identity.name || null, sentByEmail: identity.email || null,
				contactId: inspection.contactId || null, proposalId: null,
				checklistId: params.id, messageId, sentAt: Date.now()
			});
		} catch {
			console.warn('E-mail de vistoria enviado sem registro de auditoria.');
		}
		return json({ success: true }, { headers: noStore });
	} catch (error) {
		return apiErrorResponse(error);
	}
}
