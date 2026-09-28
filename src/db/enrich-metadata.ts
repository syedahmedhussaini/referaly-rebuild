/**
 * Enriches clinic metadata from the Google Places API (New) in a single pass.
 *
 * Usage: npm run db:enrich-metadata
 * Requires: GOOGLE_MAPS_API_KEY (server-side key with Places API (New) enabled)
 *           DATABASE_URL pointing at a live Postgres.
 *
 * Flow per location:
 *   1. Text Search (New) with "clinic name, address" -> Google Place ID
 *   2. Place Details (New) with an Enterprise-tier field mask
 *      (id,displayName,rating,userRatingCount,regularOpeningHours,googleMapsUri)
 *   3. If the location's hours are NULL -> fill from regularOpeningHours
 *   4. Upsert the clinic's rating/count/Maps link into clinic_google_reviews
 *      (once per clinic per run)
 *
 * Cost: stays on the Enterprise tier (~$20/1k, ~1k free/mo). Deliberately
 * excludes `reviews`/`reviewSummary`, which would push calls into the
 * pricier Enterprise + Atmosphere tier. Two API calls per location.
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq } from 'drizzle-orm';
import {
	buildTextSearchQuery,
	metadataFieldMask,
	normalizeOpeningHours,
	normalizePlaceDetails,
	PLACES_API_BASE,
	textSearchFieldMask,
} from '../lib/google-places';
import { db } from './client';
import { clinicGoogleReviews, clinics, locations } from './schema';

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

async function fetchPlaceDetails(
	apiKey: string,
	placeId: string,
): Promise<Record<string, unknown>> {
	const res = await fetch(
		`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
		{ headers: apiHeaders(apiKey, metadataFieldMask()) },
	);
	if (!res.ok) {
		throw new Error(`Place Details failed: ${res.status} ${await res.text()}`);
	}
	return (await res.json()) as Record<string, unknown>;
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

	const allLocations = await db
		.select({
			locationId: locations.id,
			clinicId: locations.clinicId,
			clinicName: clinics.name,
			address: locations.address,
			city: locations.city,
			province: locations.province,
			hours: locations.hours,
		})
		.from(locations)
		.innerJoin(clinics, eq(locations.clinicId, clinics.id));

	console.log(`${allLocations.length} location(s) to check`);

	let hoursUpdated = 0;
	let reviewsUpdated = 0;
	let notFound = 0;
	let failed = 0;
	const reviewsDone = new Set<string>();

	for (const loc of allLocations) {
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
			const raw = await fetchPlaceDetails(apiKey, placeId);
			const details = normalizePlaceDetails(raw);

			// Hours — only fill when missing, never overwrite.
			if (loc.hours == null) {
				const hours = normalizeOpeningHours(raw.regularOpeningHours);
				if (hours) {
					await db
						.update(locations)
						.set({ hours })
						.where(eq(locations.id, loc.locationId));
					console.log(
						`hours updated ${loc.clinicName}: ${Object.keys(hours).join(',')}`,
					);
					hoursUpdated++;
				} else {
					console.warn(`no opening hours for: ${loc.clinicName}`);
				}
			}

			// Reviews — one snapshot per clinic per run.
			if (!reviewsDone.has(loc.clinicId)) {
				await db
					.insert(clinicGoogleReviews)
					.values({
						clinicId: loc.clinicId,
						placeId: details.placeId,
						rating:
							details.rating != null ? String(details.rating) : null,
						reviewCount: details.reviewCount,
						reviews: [],
						googleMapsUri: details.googleMapsUri,
						fetchedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: clinicGoogleReviews.clinicId,
						set: {
							placeId: details.placeId,
							rating:
								details.rating != null ? String(details.rating) : null,
							reviewCount: details.reviewCount,
							reviews: [],
							googleMapsUri: details.googleMapsUri,
							fetchedAt: new Date(),
							updatedAt: new Date(),
						},
					});
				console.log(
					`reviews updated ${loc.clinicName}: rating ${details.rating} (${details.reviewCount})`,
				);
				reviewsUpdated++;
				reviewsDone.add(loc.clinicId);
			}
		} catch (err) {
			console.error(
				`failed ${loc.clinicName}: ${err instanceof Error ? err.message : err}`,
			);
			failed++;
		}
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(
		`done: ${hoursUpdated} hours updated, ${reviewsUpdated} clinics reviewed, ` +
			`${notFound} not found, ${failed} failed`,
	);
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
