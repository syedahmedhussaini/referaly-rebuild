import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    // Only needed for `db:migrate` / `db:push`; `db:generate` works offline.
    url: process.env.DATABASE_URL ?? 'postgresql://referaly:referaly@localhost:5432/referaly',
  },
})
