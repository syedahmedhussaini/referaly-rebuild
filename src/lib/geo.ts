/**
 * Pure geographic helpers for the map viewport API.
 * No I/O here — safe to unit test.
 */

export interface BBox {
	minLng: number;
	minLat: number;
	maxLng: number;
	maxLat: number;
}

export type BBoxValidation =
	| { ok: true; bbox: BBox }
	| { ok: false; issues: string[] };

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validates a map-viewport bounding box: all four edges present, finite,
 * within WGS84 ranges, and min < max on both axes.
 */
export function validateBbox(value: unknown): BBoxValidation {
	const issues: string[] = [];
	const v = (value ?? {}) as Record<string, unknown>;

	const edges: Array<[keyof BBox, string, number, number]> = [
		['minLng', 'minLng', -180, 180],
		['maxLng', 'maxLng', -180, 180],
		['minLat', 'minLat', -90, 90],
		['maxLat', 'maxLat', -90, 90],
	];

	const nums = {} as Record<keyof BBox, number>;
	let valid = true;
	for (const [key, label, lo, hi] of edges) {
		const n = v[key];
		if (!isFiniteNumber(n)) {
			issues.push(`bbox.${label} must be a finite number`);
			valid = false;
			continue;
		}
		if (n < lo || n > hi) {
			issues.push(`bbox.${label} must be between ${lo} and ${hi}`);
			valid = false;
			continue;
		}
		nums[key] = n;
	}
	if (!valid) return { ok: false, issues };

	if (nums.minLng >= nums.maxLng) {
		issues.push('bbox.minLng must be less than bbox.maxLng');
	}
	if (nums.minLat >= nums.maxLat) {
		issues.push('bbox.minLat must be less than bbox.maxLat');
	}
	if (issues.length > 0) return { ok: false, issues };

	return { ok: true, bbox: nums };
}
