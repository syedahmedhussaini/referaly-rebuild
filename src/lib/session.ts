import { createServerFn } from '@tanstack/react-start';
import { getRequestHeaders } from '@tanstack/react-start/server';
import { auth } from '#/lib/auth';

/** Current Better Auth session (or null) for the incoming request. */
export const getSession = createServerFn({ method: 'GET' }).handler(
	async () => {
		const session = await auth.api.getSession({
			headers: getRequestHeaders() as unknown as Headers,
		});
		return session;
	},
);

/** Which sign-in providers are configured (drives the auth UI). */
export const getAuthConfig = createServerFn({ method: 'GET' }).handler(
	async () => ({
		googleEnabled: Boolean(
			process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
		),
	}),
);
