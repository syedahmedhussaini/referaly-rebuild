/**
 * Diagnostic: runs the exact query the homepage loader runs, to surface
 * the real error when the site 500s.
 *
 * Usage: npm run db:diagnose
 * Requires: DATABASE_URL pointing at a live Postgres with PostGIS.
 */
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from './client';

async function main() {
	// 1. Raw counts.
	const counts = await db.execute(
		sql`SELECT count(*) AS total, count(geom) AS geocoded FROM locations`,
	);
	console.log('locations:', JSON.stringify(counts.rows));

	// 2. The exact homepage loader query.
	const rows = await db.query.clinics.findMany({
		with: { locations: true, services: true, waitTimes: true },
		orderBy: (c, { asc }) => [asc(c.name)],
	});
	console.log(`clinics: ${rows.length}`);
	for (const c of rows.slice(0, 3)) {
		console.log(
			`- ${c.name}: ${c.locations.length} location(s), ` +
				`geom=${JSON.stringify(c.locations[0]?.geom)}`,
		);
	}
	console.log('DIAGNOSE OK');
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error('DIAGNOSE FAILED:', err?.stack || err);
		process.exit(1);
	},
);
