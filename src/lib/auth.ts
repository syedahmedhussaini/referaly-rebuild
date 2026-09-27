import 'dotenv/config';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '#/db/client';

export const ROLES = ['patient', 'clinic', 'admin'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Google OAuth is wired but env-gated: it is only registered when both
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set. Until then the app
 * runs on email/password auth alone — no Google Cloud account needed.
 */
const googleProvider =
	process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
		? {
				google: {
					clientId: process.env.GOOGLE_CLIENT_ID,
					clientSecret: process.env.GOOGLE_CLIENT_SECRET,
				},
			}
		: {};

export const auth = betterAuth({
	database: drizzleAdapter(db, { provider: 'pg' }),
	secret: process.env.BETTER_AUTH_SECRET,
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
	},
	socialProviders: {
		...googleProvider,
	},
	user: {
		additionalFields: {
			role: {
				type: 'string',
				required: false,
				defaultValue: 'patient',
				// Not settable at sign-up; assigned by admins / claim flow in Phase 3.
				input: false,
			},
		},
	},
});

export type Session = typeof auth.$Infer.Session;
export type AuthUser = Session['user'];
