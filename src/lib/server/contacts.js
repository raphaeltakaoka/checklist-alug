import { ApiError } from '$lib/server/errors';
import { contactNameMatches, normalizeContactName } from '$lib/contacts.js';

export function contactSelection(snapshot) {
	if (!snapshot.exists) throw new ApiError(400, 'O contato vinculado não existe mais. Selecione outro contato.');
	const data = snapshot.data();
	if (typeof data.nome !== 'string' || !data.nome.trim() || data.nome.length > 200) {
		throw new ApiError(400, 'O contato precisa de um nome válido no CRM.');
	}
	return {
		id: snapshot.id,
		uid: typeof data.uid === 'string' && data.uid.trim() ? data.uid : snapshot.id,
		nome: data.nome,
		email: typeof data.email === 'string' ? data.email : '',
		telefone: typeof data.telefone === 'string' ? data.telefone : ''
	};
}

export function validateContactId(id) {
	if (typeof id !== 'string' || !id || id.length > 1500 || id.includes('/') || id === '.' || id === '..') {
		throw new ApiError(400, 'Selecione um contato cadastrado.');
	}
	return id;
}

export async function searchContacts(db, input) {
	if (typeof input !== 'string' || input.length > 200) throw new ApiError(400, 'Informe um nome com até 200 caracteres.');
	const term = normalizeContactName(input);
	if (term.length < 3) return [];
	// CRM indexes prefixes up to 25 characters. Filter the full name after querying
	// because the shared tokens also include phone numbers and email addresses.
	const query = db.collection('contacts').where('searchTokens', 'array-contains', term.slice(0, 25)).limit(30);
	const contacts = [];
	let cursor;
	for (let page = 0; page < 10 && contacts.length < 10; page++) {
		const snapshot = await (cursor ? query.startAfter(cursor) : query).get();
		for (const document of snapshot.docs) {
			const data = document.data();
			if (typeof data.nome === 'string' && data.nome.trim() && data.nome.length <= 200 && contactNameMatches(data.nome, term)) {
				contacts.push(contactSelection(document));
				if (contacts.length === 10) break;
			}
		}
		if (snapshot.docs.length < 30) break;
		cursor = snapshot.docs.at(-1);
	}
	return contacts;
}
