import { createServerFn } from '@tanstack/react-start';
import { eq, inArray } from 'drizzle-orm';
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
function standardValidator<TInput, TOutput>(
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

const clinicIdValidator = standardValidator<{ id: string }, { id: string }>(
	(value) => {
		const id = (value as { id?: unknown } | undefined)?.id;
		return typeof id === 'string' && id.length > 0
			? { value: { id } }
			: { issues: [{ message: 'Invalid clinic id' }] };
	},
);

const clinicWith = {
	locations: true,
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
		geom: { x: number; y: number } | null;
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
