import { createServerFn } from '@tanstack/react-start';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '#/db/client';
import type { ScanType } from '#/db/schema';
import { clinics, scanTypeEnum, services } from '#/db/schema';

export type { ScanType } from '#/db/schema';

/** Scan types in filter-tab order, with display labels. */
export const SCAN_TYPE_LABELS: Record<ScanType, string> = {
	x_ray: 'X-Ray',
	ultrasound: 'Ultrasound',
	ct: 'CT',
	mri: 'MRI',
	mammography: 'Mammography',
	nuclear_medicine: 'Nuclear Medicine',
	bone_density: 'Bone Density',
};

export const SCAN_TYPES: readonly ScanType[] = scanTypeEnum.enumValues;

export function isScanType(value: unknown): value is ScanType {
	return (
		typeof value === 'string' &&
		(SCAN_TYPES as readonly string[]).includes(value)
	);
}

/** Opening hours in a JSON-safe shape (stored shape is TBD; seed writes NULL). */
export type ClinicHours = Record<string, string[]> | null;

function normalizeHours(hours: unknown): ClinicHours {
	if (!hours || typeof hours !== 'object' || Array.isArray(hours)) return null;
	const out: Record<string, string[]> = {};
	for (const [day, times] of Object.entries(hours)) {
		if (Array.isArray(times)) out[day] = times.map(String);
		else if (times != null && times !== '') out[day] = [String(times)];
	}
	return out;
}

/**
 * Minimal standard-schema validator (no extra deps) for server-fn inputs.
 * Types are carried explicitly via `~standard.types`.
 */
export function standardValidator<TInput, TOutput>(
	validate: (
		value: unknown,
	) => { value: TOutput } | { issues: Array<{ message: string }> },
) {
	return {
		'~standard': {
			validate,
			types: {
				input: null as unknown as TInput,
				output: null as unknown as TOutput,
			},
		},
	};
}

const scanFilterValidator = standardValidator<
	{ scanType?: ScanType },
	{ scanType: ScanType | undefined }
>((value) => {
	const scanType = (value as { scanType?: unknown } | undefined)?.scanType;
	return {
		value: { scanType: isScanType(scanType) ? scanType : undefined },
	};
});

export const clinicIdValidator = standardValidator<
	{ id: string },
	{ id: string }
>((value) => {
	const id = (value as { id?: unknown } | undefined)?.id;
	return typeof id === 'string' && id.length > 0
		? { value: { id } }
		: { issues: [{ message: 'Invalid clinic id' }] };
});

const clinicWith = {
	// Exclude geom: drizzle-orm cannot parse PostGIS geometry inside
	// relational (JSON-nested) queries — Postgres returns it as GeoJSON,
	// not EWKB hex, and parseEWKB throws "Offset is outside the bounds of
	// the DataView" (drizzle-team/drizzle-orm#2788, still open in 0.45.x).
	// Coordinates come from getClinicsInBounds (raw SQL with ST_X/ST_Y).
	locations: {
		columns: {
			geom: false,
		},
	},
	services: true,
	waitTimes: true,
} as const;

type ClinicRow = {
	id: string;
	createdAt: Date;
	updatedAt: Date;
	name: string;
	about: string | null;
	phone: string | null;
	email: string | null;
	website: string | null;
	languages: string[] | null;
	locations: Array<{
		id: string;
		createdAt: Date;
		updatedAt: Date;
		clinicId: string;
		label: string | null;
		address: string;
		city: string | null;
		province: string | null;
		postalCode: string | null;
		// geom is excluded from the relational select (see clinicWith) —
		// drizzle-orm can't parse PostGIS geometry in JSON-nested queries.
		hours: unknown;
	}>;
	services: Array<{
		id: string;
		createdAt: Date;
		updatedAt: Date;
		clinicId: string;
		scanType: ScanType;
	}>;
	waitTimes: Array<{
		id: string;
		createdAt: Date;
		updatedAt: Date;
		clinicId: string;
		scanType: ScanType;
		days: number;
		reportedBy: 'clinic' | 'patient';
		confirmations: number;
		disputes: number;
		reportedAt: Date;
	}>;
};

/**
 * The drizzle `jsonb` hours column types as `unknown`, which the server-function
 * serializer rejects — normalize it to a JSON-safe shape before returning.
 */
function toSerializableClinic<T extends ClinicRow>(clinic: T) {
	return {
		...clinic,
		locations: clinic.locations.map((l) => ({
			...l,
			hours: normalizeHours(l.hours),
		})),
	};
}

/**
 * SSR loader data for the directory. Optional server-side scan-type filter —
 * unknown/empty values are ignored and return the full list.
 */
export const listClinics = createServerFn({ method: 'GET' })
	.validator(scanFilterValidator)
	.handler(async ({ data }) => {
		// Defensive: the validator normalizes already, but never trust the wire.
		const scanType = isScanType(data.scanType) ? data.scanType : undefined;

		const rows: ClinicRow[] = !scanType
			? await db.query.clinics.findMany({
					with: clinicWith,
					orderBy: (c, { asc }) => [asc(c.name)],
				})
			: await (async () => {
					const matches = await db
						.select({ clinicId: services.clinicId })
						.from(services)
						.where(eq(services.scanType, scanType));
					const ids = [...new Set(matches.map((m) => m.clinicId))];
					if (ids.length === 0) return [];
					return db.query.clinics.findMany({
						where: inArray(clinics.id, ids),
						with: clinicWith,
						orderBy: (c, { asc }) => [asc(c.name)],
					});
				})();

		return rows.map(toSerializableClinic);
	});

/**
 * SSR loader data for /clinic/:id. Returns null when the id is unknown;
 * the route turns that into a 404.
 */
export const getClinic = createServerFn({ method: 'GET' })
	.validator(clinicIdValidator)
	.handler(async ({ data }) => {
		if (!data.id) return null;
		const row: ClinicRow | undefined = await db.query.clinics.findFirst({
			where: eq(clinics.id, data.id),
			with: clinicWith,
		});
		return row ? toSerializableClinic(row) : null;
	});

export type ClinicDirectoryEntry = Awaited<
	ReturnType<typeof listClinics>
>[number];
export type ClinicDetail = Awaited<ReturnType<typeof getClinic>>;

/** Directory entry with distance from the search origin (null when no geo search). */
export type ClinicSearchEntry = ClinicDirectoryEntry & {
	distanceKm: number | null;
};

const searchValidator = standardValidator<
	{
		scanType?: ScanType;
		lat?: number;
		lng?: number;
		radiusKm?: number;
	},
	{
		scanType: ScanType | undefined;
		lat: number | undefined;
		lng: number | undefined;
		radiusKm: number;
	}
>((value) => {
	const v = (value ?? {}) as {
		scanType?: unknown;
		lat?: unknown;
		lng?: unknown;
		radiusKm?: unknown;
	};
	const lat =
		typeof v.lat === 'number' && Number.isFinite(v.lat) && v.lat >= -90 && v.lat <= 90
			? v.lat
			: undefined;
	const lng =
		typeof v.lng === 'number' &&
		Number.isFinite(v.lng) &&
		v.lng >= -180 &&
		v.lng <= 180
			? v.lng
			: undefined;
	const radiusKm =
		typeof v.radiusKm === 'number' &&
		Number.isFinite(v.radiusKm) &&
		v.radiusKm > 0 &&
		v.radiusKm <= 100
			? v.radiusKm
			: 25;
	return {
		value: {
			scanType: isScanType(v.scanType) ? v.scanType : undefined,
			lat,
			lng,
			radiusKm,
		},
	};
});

/**
 * Geo-aware directory search. When lat/lng are given, returns clinics within
 * `radiusKm` ordered by distance (nearest first) with `distanceKm` attached;
 * otherwise behaves like listClinics with `distanceKm: null`. Optional
 * scan-type filter applies in both cases.
 */
export const searchClinics = createServerFn({ method: 'GET' })
	.validator(searchValidator)
	.handler(async ({ data }): Promise<ClinicSearchEntry[]> => {
		const { scanType, lat, lng, radiusKm } = data;

		const scanFilter = scanType
			? sql`AND EXISTS (
					SELECT 1 FROM services s2
					WHERE s2.clinic_id = c.id AND s2.scan_type = ${scanType}
				)`
			: sql``;

		// Resolve matching clinic IDs in display order (distance or name).
		let ordered: Array<{ clinicId: string; distanceKm: number | null }>;
		if (lat != null && lng != null) {
			const result = await db.execute(sql`
				SELECT
					c.id AS "clinicId",
					MIN(
						ST_Distance(
							l.geom::geography,
							ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
						)
					) / 1000 AS "distanceKm"
				FROM clinics c
				JOIN locations l ON l.clinic_id = c.id
				WHERE l.geom IS NOT NULL
					AND ST_DWithin(
						l.geom::geography,
						ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
						${radiusKm * 1000}
					)
					${scanFilter}
				GROUP BY c.id
				ORDER BY "distanceKm"
			`);
			ordered = (
				result.rows as Array<{ clinicId: string; distanceKm: string | number }>
			).map((r) => ({ clinicId: r.clinicId, distanceKm: Number(r.distanceKm) }));
		} else {
			const result = await db.execute(sql`
				SELECT c.id AS "clinicId"
				FROM clinics c
				WHERE TRUE ${scanFilter}
				ORDER BY c.name ASC
			`);
			ordered = (result.rows as Array<{ clinicId: string }>).map((r) => ({
				clinicId: r.clinicId,
				distanceKm: null,
			}));
		}

		if (ordered.length === 0) return [];
		const rows: ClinicRow[] = await db.query.clinics.findMany({
			where: inArray(
				clinics.id,
				ordered.map((o) => o.clinicId),
			),
			with: clinicWith,
		});
		const byId = new Map(rows.map((r) => [r.id, r]));
		return ordered.flatMap((o) => {
			const row = byId.get(o.clinicId);
			return row
				? [{ ...toSerializableClinic(row), distanceKm: o.distanceKm }]
				: [];
		});
	});
