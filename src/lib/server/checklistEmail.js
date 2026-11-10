import { createHash } from 'node:crypto';
import * as env from '$app/env/private';
import nodemailer from 'nodemailer';
import { adminDb } from '$lib/server/admin';
import { ApiError } from '$lib/server/errors';

const MAX_PDF_BYTES = 17 * 1024 * 1024;
const EMAIL_REGEX = /^[^\s@,;:<>()\[\]"\\]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
let transporter;

export function validEmail(value) {
	return typeof value === 'string' && value.length <= 254 && EMAIL_REGEX.test(value);
}

export async function takeEmailQuota(uid) {
	// Share the CRM's quota so changing apps does not bypass the limit.
	const scope = 'email-send';
	const key = createHash('sha256').update(scope + ':' + uid).digest('hex');
	const ref = adminDb.collection('rate_limits').doc(key);
	const now = Date.now();
	return adminDb.runTransaction(async transaction => {
		const current = (await transaction.get(ref)).data();
		if (!current || typeof current.resetAt !== 'number' || current.resetAt <= now) {
			transaction.set(ref, { scope, userId: uid, count: 1, resetAt: now + 60 * 60 * 1000 });
			return 0;
		}
		if (current.count >= 20) return Math.ceil((current.resetAt - now) / 1000);
		transaction.update(ref, { count: current.count + 1 });
		return 0;
	});
}

export function emailSettings() {
	const crm = URL.parse(env.CRM_BASE_URL);
	const user = env.GMAIL_SMTP_USER.trim();
	const pass = env.GMAIL_SMTP_APP_PASSWORD.replace(/\s+/g, '');
	if (!crm || crm.protocol !== 'https:' || crm.href !== crm.origin + '/' || !user || !pass) {
		throw new ApiError(503, 'O serviço de e-mail da vistoria está indisponível.');
	}
	return { crm, user, pass };
}

export async function loadCrmPdf(crm, id, authorization) {
	const url = new URL('/api/checklists/' + encodeURIComponent(id) + '/pdf', crm);
	try {
		const response = await fetch(url, {
			headers: { authorization, accept: 'application/pdf' },
			redirect: 'error',
			signal: AbortSignal.timeout(60_000)
		});
		if (!response.ok || response.headers.get('content-type') !== 'application/pdf' || !response.body) {
			await response.body?.cancel();
			if (response.status === 403) throw new ApiError(403, 'Você não tem permissão para gerar este PDF no CRM.');
			if (response.status === 429) throw new ApiError(429, 'Limite de PDFs atingido. Tente novamente mais tarde.');
			throw new Error('Unexpected PDF response');
		}
		const chunks = [];
		let bytes = 0;
		for await (const chunk of response.body) {
			bytes += chunk.byteLength;
			if (bytes > MAX_PDF_BYTES) throw new ApiError(422, 'O PDF excede o tamanho permitido para envio por e-mail.');
			chunks.push(chunk);
		}
		const pdf = Buffer.concat(chunks, bytes);
		if (pdf.toString('ascii', 0, 5) !== '%PDF-') throw new Error('Invalid PDF');
		return pdf;
	} catch (error) {
		if (error instanceof ApiError) throw error;
		throw new ApiError(502, 'Não foi possível gerar o PDF da vistoria no CRM.');
	}
}

export async function sendChecklistEmail(settings, inspection, pdf, { to, subject, message }) {
	// Use the same Google Workspace SMTP configuration as the CRM.
	transporter ??= nodemailer.createTransport({
		host: 'smtp.gmail.com', port: 465, secure: true,
		auth: { user: settings.user, pass: settings.pass },
		connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
		disableFileAccess: true, disableUrlAccess: true, maxRecipients: 1
	});
	const fromEmail = env.GMAIL_FROM_EMAIL.trim() || settings.user;
	const type = (inspection.inspectionType || '').replace(/[^A-Za-z0-9_-]/g, '') || 'Vistoria';
	const plate = (inspection.licensePlate || '').replace(/[^A-Za-z0-9_-]/g, '') || 'Veiculo';
	try {
		return await transporter.sendMail({
			from: { name: env.GMAIL_FROM_NAME.trim() || 'ALUG', address: fromEmail },
			replyTo: env.GMAIL_REPLY_TO.trim() || fromEmail,
			to: { name: '', address: to },
			subject,
			text: message,
			attachments: [{
				filename: 'Checklist_' + type + '_' + plate + '.pdf',
				content: pdf,
				contentType: 'application/pdf'
			}]
		});
	} catch {
		throw new ApiError(502, 'Não foi possível enviar o e-mail. Tente novamente.');
	}
}
