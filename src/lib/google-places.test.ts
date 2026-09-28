import { describe, expect, it } from 'vitest';
import {
	buildTextSearchQuery,
	metadataFieldMask,
	normalizeOpeningHours,
	normalizePlaceDetails,
	normalizeReviews,
	parseGeocodeResponse,
	placeDetailsFieldMask,
	textSearchFieldMask,
} from './google-places';

describe('field masks', () => {
	it('requests a minimal Place Details mask', () => {
		const mask = placeDetailsFieldMask();
		expect(mask).toContain('reviews');
		expect(mask).toContain('rating');
		expect(mask).toContain('userRatingCount');
		// No photos/opening-hours — keep the call on the cheapest SKU.
		expect(mask).not.toContain('photos');
	});

	it('requests only id + name for text search', () => {
		expect(textSearchFieldMask()).toBe('places.id,places.displayName');
	});
});

describe('buildTextSearchQuery', () => {
	it('combines name and address', () => {
		expect(
			buildTextSearchQuery(
				'Annex Medical Imaging',
				'800 Bathurst Street, Toronto, ON',
			),
		).toBe('Annex Medical Imaging, 800 Bathurst Street, Toronto, ON');
	});
});

describe('normalizeReviews', () => {
	const apiReview = {
		name: 'places/abc/reviews/1',
		relativePublishTimeDescription: '2 months ago',
		rating: 5,
		text: { text: 'Great clinic, fast service.', languageCode: 'en' },
		originalText: { text: 'Great clinic, fast service.', languageCode: 'en' },
		authorAttribution: {
			displayName: 'Jane Doe',
			uri: 'https://www.google.com/maps/contrib/123',
			photoUri: 'https://example.com/photo.jpg',
		},
		publishTime: '2026-07-01T12:00:00Z',
		flagContentUri: 'https://www.google.com/maps/flag/1',
	};

	it('normalizes a full review', () => {
		const [r] = normalizeReviews([apiReview]);
		expect(r).toEqual({
			author: 'Jane Doe',
			authorUri: 'https://www.google.com/maps/contrib/123',
			photoUri: 'https://example.com/photo.jpg',
			rating: 5,
			text: 'Great clinic, fast service.',
			relativeTime: '2 months ago',
			publishedAt: '2026-07-01T12:00:00Z',
			flagContentUri: 'https://www.google.com/maps/flag/1',
		});
	});

	it('caps at 5 reviews and tolerates missing fields', () => {
		const many = Array.from({ length: 8 }, (_, i) => ({
			...apiReview,
			rating: i,
		}));
		const out = normalizeReviews(many);
		expect(out).toHaveLength(5);

		const [sparse] = normalizeReviews([{}]);
		expect(sparse.author).toBe('Google user');
		expect(sparse.rating).toBeNull();
		expect(sparse.text).toBeNull();
	});

	it('returns [] for non-array input', () => {
		expect(normalizeReviews(null)).toEqual([]);
		expect(normalizeReviews('nope')).toEqual([]);
	});
});

describe('normalizePlaceDetails', () => {
	it('extracts rating, count and reviews', () => {
		const out = normalizePlaceDetails({
			id: 'places/abc',
			displayName: { text: 'Annex Medical Imaging' },
			rating: 4.3,
			userRatingCount: 127,
			reviews: [{ rating: 5, text: { text: 'Good' } }],
		});
		expect(out.placeId).toBe('places/abc');
		expect(out.rating).toBe(4.3);
		expect(out.reviewCount).toBe(127);
		expect(out.reviews).toHaveLength(1);
	});

	it('nulls out missing aggregates', () => {
		const out = normalizePlaceDetails({});
		expect(out.rating).toBeNull();
		expect(out.reviewCount).toBeNull();
		expect(out.reviews).toEqual([]);
	});
});

describe('parseGeocodeResponse', () => {
	it('returns the first result coordinates on OK', () => {
		expect(
			parseGeocodeResponse({
				status: 'OK',
				results: [{ geometry: { location: { lat: 43.6629, lng: -79.3957 } } }],
			}),
		).toEqual({ lat: 43.6629, lng: -79.3957 });
	});

	it('returns null on ZERO_RESULTS', () => {
		expect(
			parseGeocodeResponse({ status: 'ZERO_RESULTS', results: [] }),
		).toBeNull();
	});

	it('throws on API errors so callers fail fast', () => {
		expect(() =>
			parseGeocodeResponse({
				status: 'REQUEST_DENIED',
				error_message: 'API key invalid',
			}),
		).toThrow(/REQUEST_DENIED/);
		expect(() => parseGeocodeResponse({ status: 'OVER_QUERY_LIMIT' })).toThrow(
			/OVER_QUERY_LIMIT/,
		);
	});

	it('returns null for malformed payloads', () => {
		expect(parseGeocodeResponse(null)).toBeNull();
		expect(parseGeocodeResponse({ status: 'OK', results: [] })).toBeNull();
	});
});

describe('normalizeOpeningHours', () => {
	it('converts periods to day-keyed ranges', () => {
		const result = normalizeOpeningHours({
			periods: [
				{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } },
				{ open: { day: 2, hour: 9, minute: 30 }, close: { day: 2, hour: 18, minute: 0 } },
			],
		});
		expect(result).toEqual({
			mon: ['09:00–17:00'],
			tue: ['09:30–18:00'],
		});
	});

	it('handles multiple periods per day (split shifts)', () => {
		const result = normalizeOpeningHours({
			periods: [
				{ open: { day: 5, hour: 9, minute: 0 }, close: { day: 5, hour: 12, minute: 0 } },
				{ open: { day: 5, hour: 13, minute: 0 }, close: { day: 5, hour: 17, minute: 0 } },
			],
		});
		expect(result).toEqual({ fri: ['09:00–12:00', '13:00–17:00'] });
	});

	it('maps Sunday (day 0) correctly', () => {
		const result = normalizeOpeningHours({
			periods: [
				{ open: { day: 0, hour: 10, minute: 0 }, close: { day: 0, hour: 14, minute: 0 } },
			],
		});
		expect(result).toEqual({ sun: ['10:00–14:00'] });
	});

	it('returns null for missing or empty periods', () => {
		expect(normalizeOpeningHours(null)).toBeNull();
		expect(normalizeOpeningHours({})).toBeNull();
		expect(normalizeOpeningHours({ periods: [] })).toBeNull();
	});

	it('skips malformed periods', () => {
		const result = normalizeOpeningHours({
			periods: [
				{ open: { day: 1, hour: 9 }, close: { day: 1, hour: 17 } },
				{ open: {}, close: {} },
				{ open: { day: 9, hour: 9 }, close: { day: 9, hour: 17 } },
			],
		});
		expect(result).toEqual({ mon: ['09:00–17:00'] });
	});
});

describe('metadataFieldMask', () => {
	it('stays on the Enterprise tier (no Atmosphere fields)', () => {
		const mask = metadataFieldMask();
		expect(mask).toContain('rating');
		expect(mask).toContain('userRatingCount');
		expect(mask).toContain('regularOpeningHours');
		expect(mask).toContain('googleMapsUri');
		expect(mask).not.toContain('reviews');
		expect(mask).not.toContain('reviewSummary');
	});
});

describe('normalizePlaceDetails googleMapsUri', () => {
	it('extracts the Maps URI', () => {
		const result = normalizePlaceDetails({
			id: 'abc',
			googleMapsUri: 'https://maps.google.com/?cid=123',
		});
		expect(result.googleMapsUri).toBe('https://maps.google.com/?cid=123');
	});

	it('is null when absent', () => {
		expect(normalizePlaceDetails({ id: 'abc' }).googleMapsUri).toBeNull();
	});
});
