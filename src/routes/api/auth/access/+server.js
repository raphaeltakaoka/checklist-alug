import { json } from '@sveltejs/kit';
import { ApiError, apiErrorResponse, requireAuth } from '$lib/server/auth';
import { canUseChecklist } from '$lib/accessControl.js';

export async function GET({ request }) {
	try {
		const identity = await requireAuth(request);
		if (!canUseChecklist(identity)) throw new ApiError(403, 'Esta conta não possui acesso ao Checklist.');
		return json({ accessVersion: 1, permissions: identity.permissions }, {
			headers: { 'cache-control': 'no-store' }
		});
	} catch (error) {
		return apiErrorResponse(error);
	}
}
