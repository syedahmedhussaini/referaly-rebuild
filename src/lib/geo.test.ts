import { describe, expect, it } from 'vitest';
import { validateBbox } from './geo';

const GTA = { minLng: -79.8, minLat: 43.4, maxLng: -79.0, maxLat: 43.9 };

describe('validateBbox', () => {
	it('accepts a valid GTA bbox', () => {
		const res = validateBbox(GTA);
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.bbox).toEqual(GTA);
	});

	it('rejects missing / non-numeric edges', () => {
		expect(validateBbox(null).ok).toBe(false);
		expect(validateBbox({}).ok).toBe(false);
		expect(validateBbox({ ...GTA, minLng: 'x' }).ok).toBe(false);
		expect(validateBbox({ ...GTA, maxLat: Number.NaN }).ok).toBe(false);
		expect(validateBbox({ ...GTA, minLat: Number.POSITIVE_INFINITY }).ok).toBe(
			false,
		);
	});

	it('rejects out-of-range coordinates', () => {
		expect(validateBbox({ ...GTA, minLng: -181 }).ok).toBe(false);
		expect(validateBbox({ ...GTA, maxLng: 181 }).ok).toBe(false);
		expect(validateBbox({ ...GTA, minLat: -91 }).ok).toBe(false);
		expect(validateBbox({ ...GTA, maxLat: 91 }).ok).toBe(false);
	});

	it('rejects inverted ranges', () => {
		expect(validateBbox({ ...GTA, minLng: -79.0, maxLng: -79.8 }).ok).toBe(
			false,
		);
		expect(validateBbox({ ...GTA, minLat: 43.9, maxLat: 43.4 }).ok).toBe(false);
		expect(validateBbox({ ...GTA, minLng: -79.5, maxLng: -79.5 }).ok).toBe(
			false,
		);
	});

	it('reports human-readable issues', () => {
		const res = validateBbox({ minLng: 0 });
		expect(res.ok).toBe(false);
		if (!res.ok) {
			expect(res.issues.length).toBeGreaterThan(0);
			expect(res.issues.every((i) => typeof i === 'string')).toBe(true);
		}
	});
});
