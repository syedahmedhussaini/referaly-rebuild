import { defineConfig } from 'vitest/config';

/**
 * Standalone vitest config (separate from vite.config.ts): unit tests cover
 * pure lib helpers only and must not boot the TanStack Start dev pipeline.
 */
export default defineConfig({
	test: {
		environment: 'node',
		include: ['src/**/*.test.ts'],
	},
});
