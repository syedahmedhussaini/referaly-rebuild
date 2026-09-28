/**
 * Backfills `locations.geom` for rows where it is NULL, using the
 * OpenStreetMap Nominatim API (free, no API key required).
 *
 * Usage: npm run db:geocode:nominatim
 * Requires: DATABASE_URL pointing at a live Postgres with PostGIS.
 *
 * Idempotent — already-geocoded rows are skipped.
 * Respects Nominatim's usage policy: max 1 request/second and an
 * identifying User-Agent.
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { isNull, sql } from 'drizzle-orm';
import { db } from './client';
import { locations } from './schema';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
/** Nominatim asks for max 1 request per second. */
const REQUEST_DELAY_MS = 1100;

interface NominatimResult {
	lat: string;
	lon: string;
	display_name: string;
}

async function geocode(query: string): Promise<{ lat: number; lng: number } | null> {
	const url =
		`${NOMINATIM_URL}?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
	const res = await fetch(url, {
		headers: {
			// Nominatim requires an identifying User-Agent.
			'User-Agent': 'referaly-rebuild/1.0 (imaging clinic directory)',
		},
	});
	if (!res.ok) {
		throw new Error(`Nominatim HTTP ${res.status} for "${query}"`);
	}
	const json = (await res.json()) as NominatimResult[];
	if (!json.length) return null;
	const first = json[0];
	const lat = Number(first.lat);
	const lng = Number(first.lon);
	if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
	return { lat, lng };
}

async function main() {
	const pending = await db.query.locations.findMany({
		where: isNull(locations.geom),
		columns: { id: true, address: true, city: true, province: true, postalCode: true },
	});
	console.log(`${pending.length} location(s) need geocoding`);

	let updated = 0;
	let skipped = 0;

	for (const loc of pending) {
		const query = [loc.address, loc.city, loc.province, loc.postalCode, 'Canada']
			.filter(Boolean)
			.join(', ');

		let coords: { lat: number; lng: number } | null;
		try {
			coords = await geocode(query);
		} catch (err) {
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
