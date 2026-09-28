/**
 * Pure helpers for the Google Maps Platform APIs used server-side:
 * Geocoding API (address -> coordinates) and Places API (New)
 * (place lookup + reviews). No network calls here — the scripts in
 * `src/db/` do the fetching; these functions build requests and
 * normalize responses. Safe to unit test.
 */

export const PLACES_API_BASE = 'https://places.googleapis.com/v1';
export const GEOCODING_API_URL =
	'https://maps.googleapis.com/maps/api/geocode/json';

/** Minimal field mask for Place Details (New) — keeps the call on the reviews SKU only. */
export function placeDetailsFieldMask(): string {
	return 'id,displayName,rating,userRatingCount,reviews';
}

/** Minimal field mask for Text Search (New) — we only need the place id. */
export function textSearchFieldMask(): string {
	return 'places.id,places.displayName';
}

/** Query used to resolve a clinic to a Google Place ID. */
export function buildTextSearchQuery(name: string, address: string): string {
	return `${name.trim()}, ${address.trim()}`;
}

export interface NormalizedReview {
	author: string;
	authorUri: string | null;
	photoUri: string | null;
	rating: number | null;
	text: string | null;
	relativeTime: string | null;
	publishedAt: string | null;
	flagContentUri: string | null;
}

const MAX_REVIEWS = 5;

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Normalizes the `reviews` array from Place Details (New) into a stable,
 * JSON-safe shape. Caps at 5 (the API maximum) and tolerates missing fields.
 */
export function normalizeReviews(reviews: unknown): NormalizedReview[] {
	if (!Array.isArray(reviews)) return [];
	return reviews.slice(0, MAX_REVIEWS).map((item) => {
		const r = (item ?? {}) as Record<string, unknown>;
		const attribution = (r.authorAttribution ?? {}) as Record<string, unknown>;
		const textObj = (r.text ?? r.originalText ?? {}) as Record<string, unknown>;
		const rating = r.rating;
		return {
			author: asString(attribution.displayName) ?? 'Google user',
			authorUri: asString(attribution.uri),
			photoUri: asString(attribution.photoUri),
			rating:
				typeof rating === 'number' && Number.isFinite(rating) ? rating : null,
			text: asString(textObj.text),
			relativeTime: asString(r.relativePublishTimeDescription),
			publishedAt: asString(r.publishTime),
			flagContentUri: asString(r.flagContentUri),
		};
	});
}

export interface PlaceDetailsResult {
	placeId: string | null;
	rating: number | null;
	reviewCount: number | null;
	reviews: NormalizedReview[];
	googleMapsUri: string | null;
}

/** Normalizes a Place Details (New) response body. */
export function normalizePlaceDetails(place: unknown): PlaceDetailsResult {
	const p = (place ?? {}) as Record<string, unknown>;
	const rating = p.rating;
	const reviewCount = p.userRatingCount;
	return {
		placeId: asString(p.id),
		rating:
			typeof rating === 'number' && Number.isFinite(rating) ? rating : null,
		reviewCount:
			typeof reviewCount === 'number' && Number.isInteger(reviewCount)
				? reviewCount
				: null,
		reviews: normalizeReviews(p.reviews),
		googleMapsUri: asString(p.googleMapsUri),
	};
}

/**
 * Field mask for the combined metadata enrichment (hours + rating/count).
 * Enterprise tier only — deliberately excludes `reviews`/`reviewSummary`,
 * which would push the call into the pricier Enterprise + Atmosphere tier.
 */
export function metadataFieldMask(): string {
	return 'id,displayName,rating,userRatingCount,regularOpeningHours,googleMapsUri';
}

export interface GeocodeResult {
	lat: number;
	lng: number;
}

/**
 * Parses a Geocoding API JSON response. Returns the first result's
 * coordinates, or null for ZERO_RESULTS / malformed payloads.
 * Throws on explicit API errors (OVER_QUERY_LIMIT, REQUEST_DENIED, …)
 * so callers can fail fast instead of silently skipping.
 */
export function parseGeocodeResponse(json: unknown): GeocodeResult | null {
	const body = (json ?? {}) as Record<string, unknown>;
	const status = body.status;
	if (status === 'ZERO_RESULTS') return null;
	if (status === 'OK') {
		const results = body.results;
		if (!Array.isArray(results) || results.length === 0) return null;
		const location = (
			(results[0] as Record<string, unknown>).geometry as Record<
				string,
				unknown
			>
		)?.location as Record<string, unknown> | undefined;
		const lat = location?.lat;
		const lng = location?.lng;
		if (typeof lat !== 'number' || typeof lng !== 'number') return null;
		return { lat, lng };
	}
	if (typeof status === 'string') {
		const message = asString(body.error_message) ?? 'unknown error';
		throw new Error(`Geocoding API error: ${status} — ${message}`);
	}
	// Malformed payload (no status at all) — treat as no result.
	return null;
}

/** Day index (0=Sunday, per Places API) -> short key used in our hours shape. */
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

/**
 * Normalizes the `regularOpeningHours` object from Place Details (New) into
 * our stored hours shape: `{ mon: ["09:00","17:00"], tue: [...], ... }`.
 * Handles multiple periods per day (e.g. split shifts) and overnight hours
 * (close.day > open.day). Returns null when no usable periods exist.
 */
export function normalizeOpeningHours(
	regularOpeningHours: unknown,
): Record<string, string[]> | null {
	const root = (regularOpeningHours ?? {}) as Record<string, unknown>;
	const periods = root.periods;
	if (!Array.isArray(periods) || periods.length === 0) return null;

	const out: Record<string, string[]> = {};
	for (const p of periods) {
		const period = (p ?? {}) as Record<string, unknown>;
		const open = (period.open ?? {}) as Record<string, unknown>;
		const close = (period.close ?? {}) as Record<string, unknown>;
		const day = open.day;
		if (typeof day !== 'number' || day < 0 || day > 6) continue;
		const openHour = open.hour;
		const openMin = typeof open.minute === 'number' ? open.minute : 0;
		const closeHour = close.hour;
		const closeMin = typeof close.minute === 'number' ? close.minute : 0;
		if (typeof openHour !== 'number' || typeof closeHour !== 'number') continue;
		const key = DAY_KEYS[day];
		const range = `${pad2(openHour)}:${pad2(openMin)}–${pad2(closeHour)}:${pad2(closeMin)}`;
		(out[key] ??= []).push(range);
	}
	return Object.keys(out).length > 0 ? out : null;
}

/** Field mask for Place Details when we only need opening hours. */
export function openingHoursFieldMask(): string {
	return 'id,displayName,regularOpeningHours';
}
