import { adminAuth } from '$lib/server/admin';
import { ApiError } from '$lib/server/errors';

export { ApiError } from '$lib/server/errors';

export function hasPermission(decodedToken, department, action) {
	const permissions = decodedToken?.roles?.[department];
	return Array.isArray(permissions) && permissions.includes(action);
}

export async function requireAuth(request) {
	const authorization = request.headers.get('authorization') || '';
	const match = authorization.match(/^Bearer\s+(.+)$/i);
	if (!match) throw new ApiError(401, 'Authentication required.');

	try {
		return await adminAuth.verifyIdToken(match[1], true);
	} catch {
		throw new ApiError(401, 'Invalid or expired authentication token.');
	}
}

export function requirePermission(decodedToken, department, action) {
	if (!hasPermission(decodedToken, department, action)) {
		throw new ApiError(403, 'Insufficient permissions.');
	}
}

export function requireCatalogReadPermission(decodedToken) {
	if (!hasPermission(decodedToken, 'operations', 'read') && !hasPermission(decodedToken, 'administrator', 'read')) {
		throw new ApiError(403, 'Insufficient permissions.');
	}
}

export function canAccessInspection(decodedToken, inspection, action) {
	return (
		hasPermission(decodedToken, 'administrator', action) ||
		(hasPermission(decodedToken, 'operations', action) &&
			inspection?.ownerUid === decodedToken.uid)
	);
}

export function assertInspectionAccess(decodedToken, inspection, action) {
	if (!canAccessInspection(decodedToken, inspection, action)) {
		throw new ApiError(403, 'You do not have access to this inspection.');
	}
}

export function apiErrorResponse(error) {
	const status = error instanceof ApiError ? error.status : 500;
	const message = status === 500 ? 'Internal server error.' : error.message;
	return new Response(JSON.stringify({ error: message }), {
		status,
		headers: {
			'content-type': 'application/json',
			'cache-control': 'no-store'
		}
	});
}
