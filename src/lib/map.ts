import { createServerFn } from '@tanstack/react-start';
import { sql } from 'drizzle-orm';
import { db } from '#/db/client';
import { isScanType, type ScanType, standardValidator } from '#/lib/clinics';
import { type BBox, validateBbox } from '#/lib/geo';

/** Compact marker row returned by the viewport query. */
export interface MapClinic {
	locationId: string;
	clinicId: string;
	name: string;
	lng: number;
	lat: number;
	services: ScanType[];
}

/** Hard cap so a continent-wide zoom can't dump the whole table. */
const MAX_RESULTS = 200;

const boundsValidator = standardValidator<
	{ bbox: BBox; scanType?: ScanType },
	{ bbox: BBox; scanType: ScanType | undefined }
>((value) => {
	const v = (value ?? {}) as { bbox?: unknown; scanType?: unknown };
	const res = validateBbox(v.bbox);
	if (!res.ok) return { issues: res.issues.map((m) => ({ message: m })) };
	return {
		value: {
			bbox: res.bbox,
			scanType: isScanType(v.scanType) ? v.scanType : undefined,
		},
	};
});

/**
 * Airbnb-style viewport query: clinics whose geocoded location falls inside
 * the map's bounding box. Uses the `locations_geom_gist_idx` GiST index via
 * `ST_Intersects(geom, ST_MakeEnvelope(...))`. Optional server-side scan-type
 * filter. Returns at most 200 compact rows (one per location).
 */
export const getClinicsInBounds = createServerFn({ method: 'GET' })
	.validator(boundsValidator)
	.handler(async ({ data }) => {
		const { minLng, minLat, maxLng, maxLat } = data.bbox;
		const scanType = data.scanType;

		const scanFilter = scanType
			? sql`AND EXISTS (
					SELECT 1 FROM services s2
					WHERE s2.clinic_id = c.id AND s2.scan_type = ${scanType}
				)`
			: sql``;

		const result = await db.execute(sql`
			SELECT
				l.id AS "locationId",
				c.id AS "clinicId",
				c.name AS name,
				ST_X(l.geom)::float8 AS lng,
				ST_Y(l.geom)::float8 AS lat,
				COALESCE(
					array_agg(s.scan_type::text) FILTER (WHERE s.scan_type IS NOT NULL),
					'{}'
				) AS services
			FROM clinics c
			JOIN locations l ON l.clinic_id = c.id
			LEFT JOIN services s ON s.clinic_id = c.id
			WHERE l.geom IS NOT NULL
				AND ST_Intersects(
					l.geom,
					ST_MakeEnvelope(${minLng}, ${minLat}, ${maxLng}, ${maxLat}, 4326)
				)
				${scanFilter}
			GROUP BY l.id, c.id, c.name
			LIMIT ${MAX_RESULTS}
		`);

		const rows = result.rows as Array<{
			locationId: string;
			clinicId: string;
			name: string;
			lng: string | number;
			lat: string | number;
			services: string[] | null;
		}>;

		return rows.map(
			(r): MapClinic => ({
				locationId: r.locationId,
				clinicId: r.clinicId,
				name: r.name,
				lng: Number(r.lng),
				lat: Number(r.lat),
				services: (Array.isArray(r.services) ? r.services : []).filter(
					isScanType,
				),
			}),
		);
	});
