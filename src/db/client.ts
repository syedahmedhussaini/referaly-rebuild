import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as authSchema from './auth-schema';
import * as schema from './schema';

if (!process.env.DATABASE_URL) {
	// Thrown only when the module is actually imported on the server,
	// so client bundles and `vite build` are unaffected.
	throw new Error('DATABASE_URL is not set. Copy .env.example to .env.');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema: { ...schema, ...authSchema } });
export type Db = typeof db;
