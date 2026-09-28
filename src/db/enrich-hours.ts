/**
 * Enriches locations with opening hours from the Google Places API (New).
 *
 * Usage: npm run db:enrich-hours
 * Requires: GOOGLE_MAPS_API_KEY (server-side key with Places API (New) enabled)
 *           DATABASE_URL pointing at a live Postgres.
 *
 * Flow per location missing hours:
 *   1. Text Search (New) with "clinic name, address" -> Google Place ID
 *   2. Place Details (New) with field mask (id,displayName,regularOpeningHours)
 *   3. Normalize to { mon: ["09:00–17:00"], ... } and UPDATE locations.hours
 *
 * Only touches locations where hours IS NULL — never overwrites manually set
 * hours. Idempotent: re-running skips already-filled rows.
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq, isNull } from 'drizzle-orm';
import {
	buildTextSearchQuery,
	normalizeOpeningHours,
	openingHoursFieldMask,
	PLACES_API_BASE,
	textSearchFieldMask,
} from '../lib/google-places';
import { db } from './client';
import { clinics, locations } from './schema';

/** Pause between requests to stay comfortably under rate limits. */
const REQUEST_DELAY_MS = 200;

function apiHeaders(apiKey: string, fieldMask: string): Record<string, string> {
	return {
		'Content-Type': 'application/json',
		'X-Goog-Api-Key': apiKey,
		'X-Goog-FieldMask': fieldMask,
	};
}

interface TextSearchResponse {
	places?: Array<{ id?: string }>;
}

async function resolvePlaceId(
	apiKey: string,
	name: string,
	address: string,
): Promise<string | null> {
	const res = await fetch(`${PLACES_API_BASE}/places:searchText`, {
		method: 'POST',
		headers: apiHeaders(apiKey, textSearchFieldMask()),
		body: JSON.stringify({
			textQuery: buildTextSearchQuery(name, address),
			maxResultCount: 1,
		}),
	});
	if (!res.ok) {
		throw new Error(`Text Search failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as TextSearchResponse;
	const place = body.places?.[0];
	return typeof place?.id === 'string' ? place.id : null;
}

async function fetchOpeningHours(
	apiKey: string,
	placeId: string,
): Promise<Record<string, string[]> | null> {
	const res = await fetch(
		`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
		{ headers: apiHeaders(apiKey, openingHoursFieldMask()) },
	);
	if (!res.ok) {
		throw new Error(`Place Details failed: ${res.status} ${await res.text()}`);
	}
	const body = (await res.json()) as Record<string, unknown>;
	return normalizeOpeningHours(body.regularOpeningHours);
}

async function main() {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		console.error(
			'Missing GOOGLE_MAPS_API_KEY. Create a Google Cloud API key with ' +
				'Places API (New) enabled and add it to .env.',
		);
		process.exit(1);
	}

	const missing = await db
		.select({
			locationId: locations.id,
			clinicName: clinics.name,
			address: locations.address,
			city: locations.city,
			province: locations.province,
		})
		.from(locations)
		.innerJoin(clinics, eq(locations.clinicId, clinics.id))
		.where(isNull(locations.hours));

	console.log(`${missing.length} location(s) missing hours`);

	let updated = 0;
	let notFound = 0;
	let noHours = 0;
	let failed = 0;

	for (const loc of missing) {
		const query = [loc.address, loc.city, loc.province]
			.filter(Boolean)
			.join(', ');
		try {
			const placeId = await resolvePlaceId(apiKey, loc.clinicName, query);
			if (!placeId) {
				console.warn(`no Google place found: ${loc.clinicName} — ${query}`);
				notFound++;
				continue;
			}
			const hours = await fetchOpeningHours(apiKey, placeId);
			if (!hours) {
				console.warn(`no opening hours for: ${loc.clinicName} (${placeId})`);
				noHours++;
				continue;
			}
			await db
				.update(locations)
				.set({ hours })
				.where(eq(locations.id, loc.locationId));
			console.log(
				`updated ${loc.clinicName}: ${Object.keys(hours).join(',')}`,
			);
			updated++;
		} catch (err) {
			console.error(
				`failed ${loc.clinicName}: ${err instanceof Error ? err.message : err}`,
			);
			failed++;
		}
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(
		`done: ${updated} updated, ${notFound} not found, ${noHours} no hours listed, ${failed} failed`,
	);
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
