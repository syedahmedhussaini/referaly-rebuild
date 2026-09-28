import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { ClinicMap } from '#/components/ClinicMap';
import { SearchBar, type SearchValues } from '#/components/SearchBar';
import type { ClinicSearchEntry, ScanType } from '#/lib/clinics';
import {
	isScanType,
	SCAN_TYPE_LABELS,
	SCAN_TYPES,
	searchClinics,
} from '#/lib/clinics';

export const Route = createFileRoute('/')({
	// Optional keys keep `search` optional on Links to "/".
	validateSearch: (
		search: Record<string, unknown>,
	): { scanType?: ScanType; lat?: number; lng?: number; label?: string } => {
		const num = (v: unknown, min: number, max: number): number | undefined => {
			const n = typeof v === 'string' ? Number(v) : v;
			return typeof n === 'number' && Number.isFinite(n) && n >= min && n <= max
				? n
				: undefined;
		};
		return {
			scanType: isScanType(search.scanType) ? search.scanType : undefined,
			lat: num(search.lat, -90, 90),
			lng: num(search.lng, -180, 180),
			label:
				typeof search.label === 'string' && search.label.length > 0
					? search.label.slice(0, 120)
					: undefined,
		};
	},
	loaderDeps: ({ search }) => ({
		scanType: search.scanType,
		lat: search.lat,
		lng: search.lng,
	}),
	loader: async ({ deps }) => searchClinics({ data: deps }),
	head: () => ({
		meta: [
			{ title: 'Referaly — Imaging Clinic Wait Times in the GTA' },
			{
				name: 'description',
				content:
					'Find diagnostic imaging clinics in the GTA and compare wait times for MRI, CT, ultrasound, X-ray and more.',
			},
		],
	}),
	component: DirectoryPage,
});

function DirectoryPage() {
	const clinicList = Route.useLoaderData();
	const { scanType, lat, lng, label } = Route.useSearch();
	const navigate = useNavigate();
	const [mobileView, setMobileView] = useState<'list' | 'map'>('list');
	const searchingByLocation = lat != null && lng != null;

	function handleSearch(values: SearchValues) {
		void navigate({
			to: '/',
			search: {
				scanType: values.scanType,
				lat: values.lat,
				lng: values.lng,
				label: values.label,
			},
		});
	}

	return (
		<div className="mx-auto max-w-7xl px-4 py-8">
			<header>
				<h1 className="text-4xl font-bold tracking-tight">Referaly</h1>
				<p className="mt-2 text-lg text-neutral-600">
					Imaging clinic wait times in the GTA
				</p>
			</header>

			<SearchBar
				initial={{ scanType, lat, lng, label }}
				onSearch={handleSearch}
			/>

			<nav aria-label="Filter by scan type" className="mt-6">
				<div className="flex flex-wrap gap-2">
					<FilterTab
						active={scanType === undefined}
						to="/"
						search={{ scanType: undefined }}
						label="All"
					/>
					{SCAN_TYPES.map((st) => (
						<FilterTab
							key={st}
							active={scanType === st}
							to="/"
							search={{ scanType: st }}
							label={SCAN_TYPE_LABELS[st]}
						/>
					))}
				</div>
			</nav>

			{/* List / map toggle — mobile only; desktop shows both side by side. */}
			<fieldset className="mt-4 inline-flex items-center rounded-full border border-neutral-300 p-1 lg:hidden">
				<legend className="sr-only">Directory view</legend>
				{(
					[
						['list', 'List'],
						['map', 'Map'],
					] as const
				).map(([value, label]) => (
					<button
						key={value}
						type="button"
						aria-pressed={mobileView === value}
						onClick={() => setMobileView(value)}
						className={`rounded-full px-5 py-1.5 text-sm font-medium transition-colors ${
							mobileView === value
								? 'bg-neutral-900 text-white'
								: 'text-neutral-600 hover:text-neutral-900'
						}`}
					>
						{label}
					</button>
				))}
			</fieldset>

			<div className="mt-6 lg:grid lg:grid-cols-12 lg:gap-8">
				<main
					className={`lg:col-span-7 ${
						mobileView === 'list' ? '' : 'hidden lg:block'
					}`}
				>
					{clinicList.length === 0 ? (
						<p className="rounded-lg border border-neutral-200 p-6 text-center text-neutral-500">
							No clinics found
							{scanType ? ` offering ${SCAN_TYPE_LABELS[scanType]}` : ''} yet.
						</p>
					) : (
						<ul className="space-y-4">
							{clinicList.map((clinic) => (
								<ClinicCard key={clinic.id} clinic={clinic} />
							))}
						</ul>
					)}
				</main>

				<aside
					aria-label="Clinic map"
					className={`lg:col-span-5 ${
						mobileView === 'map' ? '' : 'hidden lg:block'
					}`}
				>
					<div className="h-[60vh] lg:sticky lg:top-4 lg:h-[calc(100vh-8rem)]">
						<ClinicMap
							scanType={scanType}
							center={searchingByLocation ? { lat, lng } : undefined}
						/>
					</div>
				</aside>
			</div>
		</div>
	);
}

function FilterTab({
	active,
	to,
	search,
	label,
}: {
	active: boolean;
	to: string;
	search?: { scanType?: ScanType };
	label: string;
}) {
	return (
		<Link
			to={to}
			// Merge so filter tabs preserve an active location search.
			search={(prev) => ({ ...prev, ...search })}
			aria-pressed={active}
			className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
				active
					? 'border-neutral-900 bg-neutral-900 text-white'
					: 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-500'
			}`}
		>
			{label}
		</Link>
	);
}

function ClinicCard({ clinic }: { clinic: ClinicSearchEntry }) {
	const location = clinic.locations[0];
	return (
		<li className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
			<div className="flex items-start justify-between gap-3">
				<Link
					to="/clinic/$clinicId"
					params={{ clinicId: clinic.id }}
					className="text-xl font-semibold text-neutral-900 hover:underline"
				>
					{clinic.name}
				</Link>
				{clinic.distanceKm != null && (
					<span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
						{clinic.distanceKm < 1
							? `${Math.round(clinic.distanceKm * 1000)} m away`
							: `${clinic.distanceKm.toFixed(1)} km away`}
					</span>
				)}
			</div>
			<div className="mt-2 flex flex-wrap gap-1.5">
				{clinic.services.map((s) => (
					<span
						key={s.id}
						className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700"
					>
						{SCAN_TYPE_LABELS[s.scanType]}
					</span>
				))}
			</div>
			<dl className="mt-3 space-y-1 text-sm text-neutral-600">
				{location && (
					<div className="flex gap-2">
						<dt className="sr-only">Address</dt>
						<dd>{location.address}</dd>
					</div>
				)}
				{clinic.phone && (
					<div className="flex gap-2">
						<dt className="sr-only">Phone</dt>
						<dd>
							<a
								href={`tel:${clinic.phone.replace(/[^+\d]/g, '')}`}
								className="text-blue-700 hover:underline"
							>
								{clinic.phone}
							</a>
						</dd>
					</div>
				)}
				{clinic.languages && clinic.languages.length > 0 && (
					<div className="flex gap-2">
						<dt className="sr-only">Languages</dt>
						<dd>Languages: {clinic.languages.join(', ')}</dd>
					</div>
				)}
			</dl>
		</li>
	);
}
