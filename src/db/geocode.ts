/**
 * Backfills `locations.geom` for rows where it is NULL, using the
 * Google Geocoding API.
 *
 * Usage: npm run db:geocode
 * Requires: GOOGLE_MAPS_API_KEY (server-side key — never the VITE_ public one)
 *           DATABASE_URL pointing at a live Postgres with PostGIS.
 *
 * Idempotent — already-geocoded rows are skipped. Fails fast on API key
 * problems (REQUEST_DENIED / OVER_QUERY_LIMIT); logs and skips addresses
 * that return ZERO_RESULTS.
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { isNull, sql } from 'drizzle-orm';
import { GEOCODING_API_URL, parseGeocodeResponse } from '../lib/google-places';
import { db } from './client';
import { locations } from './schema';

/** Pause between requests to stay comfortably under rate limits. */
const REQUEST_DELAY_MS = 200;

async function main() {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		console.error(
			'Missing GOOGLE_MAPS_API_KEY. Create a Google Cloud API key with the ' +
				'Geocoding API enabled (see README "Google Maps setup") and add it to .env.',
		);
		process.exit(1);
	}

	const pending = await db.query.locations.findMany({
		where: isNull(locations.geom),
		columns: { id: true, address: true, city: true, province: true },
	});
	console.log(`${pending.length} location(s) need geocoding`);

	let updated = 0;
	let skipped = 0;

	for (const loc of pending) {
		const query = [loc.address, loc.city, loc.province]
			.filter(Boolean)
			.join(', ');
		const url =
			`${GEOCODING_API_URL}?address=${encodeURIComponent(query)}` +
			`&key=${encodeURIComponent(apiKey)}`;

		let json: unknown;
		try {
			const res = await fetch(url);
			json = await res.json();
		} catch (err) {
			console.error(`network error for "${query}":`, err);
			process.exit(1);
		}

		let coords: { lat: number; lng: number } | null;
		try {
			coords = parseGeocodeResponse(json);
		} catch (err) {
			// REQUEST_DENIED / OVER_QUERY_LIMIT / INVALID_REQUEST — fail fast.
			console.error(`geocoding failed for "${query}":`, (err as Error).message);
			process.exit(1);
		}

		if (!coords) {
			console.warn(`no results for "${query}" — skipping`);
			skipped++;
		} else {
			await db.execute(sql`
				UPDATE locations
				SET geom = ST_SetSRID(ST_MakePoint(${coords.lng}, ${coords.lat}), 4326),
				    updated_at = now()
				WHERE id = ${loc.id}
			`);
			console.log(`geocoded: "${query}" -> ${coords.lat}, ${coords.lng}`);
			updated++;
		}

		await sleep(REQUEST_DELAY_MS);
	}

	console.log(`done: ${updated} geocoded, ${skipped} skipped (no results)`);
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
