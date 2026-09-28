import { createServerFn } from '@tanstack/react-start';
import { eq } from 'drizzle-orm';
import { db } from '#/db/client';
import { clinicGoogleReviews } from '#/db/schema';
import { clinicIdValidator } from '#/lib/clinics';
import { type NormalizedReview, normalizeReviews } from '#/lib/google-places';

/** Cached Google-reviews snapshot for one clinic, JSON-safe for the client. */
export interface ClinicGoogleReviews {
	placeId: string | null;
	rating: number | null;
	reviewCount: number | null;
	reviews: NormalizedReview[];
	googleMapsUri: string | null;
	fetchedAt: string | null;
}

/**
 * Returns the cached Google reviews snapshot for a clinic, or null when the
 * enrichment script (`npm run db:enrich-metadata`) has never stored one.
 * The `reviews` jsonb column is normalized to a JSON-safe shape here because
 * the server-fn serializer rejects drizzle's `unknown` jsonb type.
 */
export const getClinicReviews = createServerFn({ method: 'GET' })
	.validator(clinicIdValidator)
	.handler(async ({ data }): Promise<ClinicGoogleReviews | null> => {
		const row = await db.query.clinicGoogleReviews.findFirst({
			where: eq(clinicGoogleReviews.clinicId, data.id),
		});
		if (!row) return null;
		return {
			placeId: row.placeId,
			rating: row.rating != null ? Number(row.rating) : null,
			reviewCount: row.reviewCount,
			reviews: normalizeReviews(row.reviews),
			googleMapsUri: row.googleMapsUri,
			fetchedAt: row.fetchedAt ? row.fetchedAt.toISOString() : null,
		};
	});
