import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth, type Role } from '#/lib/auth';

/**
 * Server-only helper: returns the session user, or throws when unauthenticated.
 * Import from server code only (loaders' server handlers, API routes) — never
 * from client components. For client-safe access use getSession() in
 * `#/lib/session`.
 */
export async function requireUser(allowedRoles?: Role[]) {
	const session = await auth.api.getSession({
		headers: getRequestHeaders() as unknown as Headers,
	});
	if (!session?.user) {
		throw new Error('Unauthorized');
	}
	const role = (session.user as { role?: Role }).role ?? 'patient';
	if (allowedRoles && !allowedRoles.includes(role)) {
		throw new Error('Forbidden');
	}
	return { ...session, role };
}
