/**
 * Enriches clinics with Google reviews via the Places API (New).
 *
 * Usage: npm run db:enrich-reviews
 * Requires: GOOGLE_MAPS_API_KEY (server-side key with Places API (New) enabled)
 *           DATABASE_URL pointing at a live Postgres.
 *
 * Flow per clinic:
 *   1. Text Search (New) with "name, address" -> Google Place ID
 *   2. Place Details (New) with a minimal field mask
 *      (id,displayName,rating,userRatingCount,reviews) -> snapshot
 *   3. Upsert into `clinic_google_reviews`
 *
 * Idempotent — re-running refreshes every row. Google caps Place Details at
 * 5 reviews per place and forbids caching place content beyond 30 days
 * (place IDs may be stored indefinitely), so run this weekly via cron —
 * see README "Google reviews enrichment".
 */
import 'dotenv/config';
import { setTimeout as sleep } from 'node:timers/promises';
import {
	buildTextSearchQuery,
	normalizePlaceDetails,
	PLACES_API_BASE,
	placeDetailsFieldMask,
	textSearchFieldMask,
} from '../lib/google-places';
import { db } from './client';
import { clinicGoogleReviews } from './schema';

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

/** Resolves a clinic to a Google Place ID, or null when not found. */
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

async function main() {
	const apiKey = process.env.GOOGLE_MAPS_API_KEY;
	if (!apiKey) {
		console.error(
			'Missing GOOGLE_MAPS_API_KEY. Create a Google Cloud API key with ' +
				'Places API (New) enabled (see README "Google Maps setup") and add it to .env.',
		);
		process.exit(1);
	}

	const allClinics = await db.query.clinics.findMany({
		with: { locations: { columns: { address: true } } },
		columns: { id: true, name: true },
	});
	console.log(`${allClinics.length} clinic(s) to enrich`);

	let enriched = 0;
	let notFound = 0;
	let failed = 0;

	for (const clinic of allClinics) {
		const address = clinic.locations[0]?.address ?? '';
		try {
			const placeId = await resolvePlaceId(apiKey, clinic.name, address);
			if (!placeId) {
				console.warn(`no Google place found: ${clinic.name} — ${address}`);
				await db
					.insert(clinicGoogleReviews)
					.values({ clinicId: clinic.id, fetchedAt: new Date() })
					.onConflictDoUpdate({
						target: clinicGoogleReviews.clinicId,
						set: {
							placeId: null,
							rating: null,
							reviewCount: null,
							reviews: [],
							fetchedAt: new Date(),
							updatedAt: new Date(),
						},
					});
				notFound++;
			} else {
				const res = await fetch(
					`${PLACES_API_BASE}/places/${encodeURIComponent(placeId)}`,
					{ headers: apiHeaders(apiKey, placeDetailsFieldMask()) },
				);
				if (!res.ok) {
					throw new Error(
						`Place Details failed: ${res.status} ${await res.text()}`,
					);
				}
				const details = normalizePlaceDetails(await res.json());
				await db
					.insert(clinicGoogleReviews)
					.values({
						clinicId: clinic.id,
						placeId: details.placeId,
						rating: details.rating != null ? String(details.rating) : null,
						reviewCount: details.reviewCount,
						reviews: details.reviews,
						fetchedAt: new Date(),
					})
					.onConflictDoUpdate({
						target: clinicGoogleReviews.clinicId,
						set: {
							placeId: details.placeId,
							rating: details.rating != null ? String(details.rating) : null,
							reviewCount: details.reviewCount,
							reviews: details.reviews,
							fetchedAt: new Date(),
							updatedAt: new Date(),
						},
					});
				console.log(
					`enriched: ${clinic.name} — rating ${details.rating ?? 'n/a'} ` +
						`(${details.reviewCount ?? 0} reviews, ${details.reviews.length} fetched)`,
				);
				enriched++;
			}
		} catch (err) {
			console.error(`failed: ${clinic.name} —`, (err as Error).message);
			failed++;
		}
		await sleep(REQUEST_DELAY_MS);
	}

	console.log(
		`done: ${enriched} enriched, ${notFound} not found on Google, ${failed} failed`,
	);
	if (failed > 0) process.exit(1);
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
