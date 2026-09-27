import { createFileRoute } from '@tanstack/react-router';
import { auth } from '#/lib/auth';

async function handleAuth({ request }: { request: Request }) {
	return auth.handler(request);
}

/** Mounts all Better Auth endpoints under /api/auth/* */
export const Route = createFileRoute('/api/auth/$')({
	server: {
		handlers: {
			GET: handleAuth,
			POST: handleAuth,
		},
	},
});
