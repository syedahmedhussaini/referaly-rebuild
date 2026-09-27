import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth, type Role } from '#/lib/auth';

/** Current Better Auth session (or null) for the incoming request. */
export const getSession = createServerFn({ method: 'GET' }).handler(
	async () => {
		const session = await auth.api.getSession({
			headers: getRequestHeaders() as unknown as Headers,
		});
		return session;
	},
);

/** Server helper: returns the session user, or throws when unauthenticated. */
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
