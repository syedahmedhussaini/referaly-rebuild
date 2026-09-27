import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import type { ClinicDetail, ClinicHours } from '#/lib/clinics';
import { getClinic, SCAN_TYPE_LABELS } from '#/lib/clinics';
import { type ClinicGoogleReviews, getClinicReviews } from '#/lib/reviews';

export const Route = createFileRoute('/clinic/$clinicId')({
	loader: async ({ params }) => {
		const clinic = await getClinic({ data: { id: params.clinicId } });
		if (!clinic) throw notFound();
		const googleReviews = await getClinicReviews({ data: { id: clinic.id } });
		return { clinic, googleReviews };
	},
	head: ({ loaderData }) => {
		const clinic = loaderData?.clinic;
		if (!clinic) {
			return { meta: [{ title: 'Clinic not found — Referaly' }] };
		}
		const location = clinic.locations[0];
		const address = location?.address ?? 'GTA';
		return {
			meta: [
				{ title: `${clinic.name} — Referaly` },
				{
					name: 'description',
					content: `${clinic.name}, diagnostic imaging clinic at ${address}. Services, contact info and wait times.`,
				},
				{
					'script:ld+json': {
						'@context': 'https://schema.org',
						'@type': 'MedicalClinic',
						name: clinic.name,
						...(clinic.phone ? { telephone: clinic.phone } : {}),
						address: {
							'@type': 'PostalAddress',
							streetAddress: location?.address,
							addressLocality: location?.city,
							addressRegion: location?.province,
							postalCode: location?.postalCode,
							addressCountry: 'CA',
						},
						medicalSpecialty: clinic.services.map(
							(s) => SCAN_TYPE_LABELS[s.scanType],
						),
					},
				},
			],
		};
	},
	component: ClinicDetailPage,
	notFoundComponent: ClinicNotFound,
});

function ClinicDetailPage() {
	const { clinic, googleReviews } = Route.useLoaderData();
	const location = clinic.locations[0];

	return (
		<div className="mx-auto max-w-3xl px-4 py-8">
			<Link
				to="/"
				className="text-sm font-medium text-blue-700 hover:underline"
			>
				&larr; All clinics
			</Link>

			<h1 className="mt-3 text-3xl font-bold tracking-tight">{clinic.name}</h1>

			<section
				aria-label="Contact information"
				className="mt-6 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
			>
				<h2 className="text-lg font-semibold">Contact</h2>
				<dl className="mt-3 space-y-2 text-sm text-neutral-700">
					{location && (
						<div>
							<dt className="font-medium text-neutral-500">Address</dt>
							<dd>{location.address}</dd>
						</div>
					)}
					<div>
						<dt className="font-medium text-neutral-500">Phone</dt>
						<dd>
							{clinic.phone ? (
								<a
									href={`tel:${clinic.phone.replace(/[^+\d]/g, '')}`}
									className="text-blue-700 hover:underline"
								>
									{clinic.phone}
								</a>
							) : (
								<span className="text-neutral-400">Not available</span>
							)}
						</dd>
					</div>
					<div>
						<dt className="font-medium text-neutral-500">Hours</dt>
						<dd>
							<HoursDisplay hours={location?.hours} />
						</dd>
					</div>
					{clinic.languages && clinic.languages.length > 0 && (
						<div>
							<dt className="font-medium text-neutral-500">Languages</dt>
							<dd>{clinic.languages.join(', ')}</dd>
						</div>
					)}
				</dl>
			</section>

			<section
				aria-label="Services offered"
				className="mt-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
			>
				<h2 className="text-lg font-semibold">Services offered</h2>
				{clinic.services.length === 0 ? (
					<p className="mt-2 text-sm text-neutral-500">
						No services listed yet.
					</p>
				) : (
					<ul className="mt-3 flex flex-wrap gap-1.5">
						{clinic.services.map((s) => (
							<li
								key={s.id}
								className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-700"
							>
								{SCAN_TYPE_LABELS[s.scanType]}
							</li>
						))}
					</ul>
				)}
			</section>

			<section
				aria-label="Wait times"
				className="mt-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
			>
				<h2 className="text-lg font-semibold">Current wait times</h2>
				{clinic.waitTimes.length === 0 ? (
					<p className="mt-2 text-sm text-neutral-500">
						This clinic hasn&apos;t published wait times yet.
					</p>
				) : (
					<ul className="mt-3 space-y-2">
						{clinic.waitTimes.map((w) => (
							<li
								key={w.id}
								className="flex items-center justify-between border-b border-neutral-100 pb-2 text-sm last:border-0"
							>
								<span className="font-medium text-neutral-800">
									{SCAN_TYPE_LABELS[w.scanType]}
								</span>
								<span className="text-neutral-600">
									{w.days} {w.days === 1 ? 'day' : 'days'}
									<span className="text-neutral-400">
										{' '}
										· reported by {w.reportedBy}
									</span>
								</span>
							</li>
						))}
					</ul>
				)}
			</section>

			<GoogleReviewsSection
				clinicName={clinic.name}
				address={location?.address}
				reviews={googleReviews}
			/>

			{clinic.about && (
				<section
					aria-label="About this clinic"
					className="mt-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
				>
					<h2 className="text-lg font-semibold">About</h2>
					<p className="mt-2 text-sm text-neutral-700">{clinic.about}</p>
				</section>
			)}
		</div>
	);
}

/** Renders opening hours; the stored shape is normalized to day -> times. */
function HoursDisplay({ hours }: { hours: ClinicHours }) {
	if (!hours || Object.keys(hours).length === 0) {
		return <span className="text-neutral-400">Hours not available</span>;
	}
	return (
		<ul className="mt-1 space-y-0.5">
			{Object.entries(hours).map(([day, times]) => (
				<li key={day} className="flex justify-between gap-4">
					<span className="font-medium capitalize">{day}</span>
					<span>{times.join(' – ')}</span>
				</li>
			))}
		</ul>
	);
}

/** Google's attribution policy: show the author name with each review. */
function GoogleReviewsSection({
	clinicName,
	address,
	reviews,
}: {
	clinicName: string;
	address: string | undefined;
	reviews: ClinicGoogleReviews | null;
}) {
	const mapsUrl = reviews?.placeId
		? `https://www.google.com/maps/search/?api=1&query_place_id=${encodeURIComponent(reviews.placeId)}`
		: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
				[clinicName, address].filter(Boolean).join(', '),
			)}`;

	return (
		<section
			aria-label="Patient reviews"
			className="mt-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm"
		>
			<h2 className="text-lg font-semibold">What patients say</h2>
			{reviews && reviews.reviews.length > 0 ? (
				<>
					{(reviews.rating != null || reviews.reviewCount != null) && (
						<p className="mt-2 flex items-center gap-2 text-sm text-neutral-600">
							{reviews.rating != null && <Stars rating={reviews.rating} />}
							{reviews.reviewCount != null && (
								<span>
									{reviews.reviewCount} Google review
									{reviews.reviewCount === 1 ? '' : 's'}
								</span>
							)}
						</p>
					)}
					<ul className="mt-4 space-y-4">
						{reviews.reviews.map((r, i) => (
							<li
								key={`${r.author}-${r.publishedAt ?? i}`}
								className="border-b border-neutral-100 pb-4 last:border-0 last:pb-0"
							>
								<div className="flex items-center justify-between gap-2">
									<p className="text-sm font-medium text-neutral-900">
										{r.authorUri ? (
											<a
												href={r.authorUri}
												target="_blank"
												rel="noopener noreferrer"
												className="hover:underline"
											>
												{r.author}
											</a>
										) : (
											r.author
										)}
									</p>
									{r.relativeTime && (
										<p className="shrink-0 text-xs text-neutral-400">
											{r.relativeTime}
										</p>
									)}
								</div>
								{r.rating != null && (
									<div className="mt-1">
										<Stars rating={r.rating} />
									</div>
								)}
								{r.text && (
									<p className="mt-1.5 text-sm text-neutral-700">{r.text}</p>
								)}
							</li>
						))}
					</ul>
					<p className="mt-4 text-xs text-neutral-400">
						Reviews from Google ·{' '}
						<a
							href={mapsUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-blue-700 hover:underline"
						>
							See all reviews on Google Maps
						</a>
					</p>
				</>
			) : (
				<p className="mt-2 text-sm text-neutral-500">
					{reviews
						? 'No Google reviews found for this clinic yet.'
						: "Google reviews haven't been collected for this clinic yet."}
				</p>
			)}
		</section>
	);
}

function Stars({ rating }: { rating: number }) {
	const full = Math.round(rating);
	return (
		<span
			role="img"
			aria-label={`Rated ${rating} out of 5`}
			className="text-amber-500"
		>
			{'★'.repeat(full)}
			<span className="text-neutral-300">{'★'.repeat(5 - full)}</span>
		</span>
	);
}

function ClinicNotFound() {
	return (
		<div className="mx-auto max-w-3xl px-4 py-16 text-center">
			<h1 className="text-2xl font-bold">Clinic not found</h1>
			<p className="mt-2 text-neutral-600">
				This clinic doesn&apos;t exist or may have been removed.
			</p>
			<Link
				to="/"
				className="mt-6 inline-block rounded-full bg-neutral-900 px-5 py-2 text-sm font-medium text-white"
			>
				Back to all clinics
			</Link>
		</div>
	);
}

// Re-export for tests/consumers that want the JSON-LD shape.
export type { ClinicDetail };
