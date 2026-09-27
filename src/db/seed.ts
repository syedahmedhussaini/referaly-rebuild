/**
 * Phase 1 seed: imports demo clinic data from
 * ~/workspace/referaly-rebuild/seed-data/clinics.json into the
 * `clinics`, `locations`, and `services` tables.
 *
 * Idempotent — clinics already present (matched by name + address) are skipped.
 *
 * Usage: npm run db:seed   (requires DATABASE_URL pointing at a live Postgres)
 *
 * TODO (before Phase 2 map search): geocode `locations.address` with the
 * Google Geocoding API and backfill `locations.geom`. Map viewport queries
 * depend on it — geom is intentionally left NULL here.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from './client';
import type { ScanType } from './schema';
import { clinics, locations, services } from './schema';

interface SeedClinic {
	name: string;
	address: string;
	phone: string | null;
	services: string[];
	hours: string | null;
	languages: string[];
	wait_times: unknown;
	review_summary: string | null;
	source_url: string;
}

interface SeedFile {
	clinics: SeedClinic[];
}

/** "X-Ray" -> "x_ray" etc. Unknown labels are dropped with a warning. */
const SERVICE_LABEL_TO_SCAN_TYPE: Record<string, ScanType> = {
	'x-ray': 'x_ray',
	ultrasound: 'ultrasound',
	ct: 'ct',
	mri: 'mri',
	mammography: 'mammography',
	'nuclear medicine': 'nuclear_medicine',
	'bone density': 'bone_density',
};

function parseAddress(address: string): {
	city: string | null;
	province: string | null;
	postalCode: string | null;
} {
	// Expected shape: "<street…>, <city>, <province>, <postal code>"
	const parts = address.split(',').map((p) => p.trim());
	if (parts.length < 3) return { city: null, province: null, postalCode: null };
	return {
		city: parts[parts.length - 3] || null,
		province: parts[parts.length - 2] || null,
		postalCode: parts[parts.length - 1] || null,
	};
}

async function main() {
	const seedPath = fileURLToPath(
		new URL('../../../seed-data/clinics.json', import.meta.url),
	);
	const raw = await readFile(seedPath, 'utf-8');
	const seed = JSON.parse(raw) as SeedFile;

	let inserted = 0;
	let skipped = 0;

	for (const entry of seed.clinics) {
		const sameName = await db.query.clinics.findMany({
			where: eq(clinics.name, entry.name),
			with: { locations: true },
		});
		const alreadySeeded = sameName.some((c) =>
			c.locations.some((l) => l.address === entry.address),
		);
		if (alreadySeeded) {
			console.log(`skip (already seeded): ${entry.name} — ${entry.address}`);
			skipped++;
			continue;
		}

		const scanTypes = new Set<ScanType>();
		for (const label of entry.services) {
			const scanType = SERVICE_LABEL_TO_SCAN_TYPE[label.toLowerCase()];
			if (!scanType) {
				console.warn(
					`unknown service label "${label}" for ${entry.name} — skipping`,
				);
				continue;
			}
			scanTypes.add(scanType);
		}

		const { city, province, postalCode } = parseAddress(entry.address);

		const [clinic] = await db
			.insert(clinics)
			.values({
				name: entry.name,
				phone: entry.phone,
				languages: entry.languages.length > 0 ? entry.languages : null,
			})
			.returning({ id: clinics.id });

		await db.insert(locations).values({
			clinicId: clinic.id,
			address: entry.address,
			city,
			province,
			postalCode,
			// geom intentionally NULL — see TODO at the top of this file.
		});

		for (const scanType of scanTypes) {
			await db
				.insert(services)
				.values({ clinicId: clinic.id, scanType })
				.onConflictDoNothing();
		}

		console.log(`inserted: ${entry.name} — ${entry.address}`);
		inserted++;
	}

	console.log(`done: ${inserted} inserted, ${skipped} skipped`);
}

main().then(
	() => process.exit(0),
	(err) => {
		console.error(err);
		process.exit(1);
	},
);
