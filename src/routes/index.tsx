import { createFileRoute, Link } from '@tanstack/react-router';
import type { ClinicDirectoryEntry, ScanType } from '#/lib/clinics';
import {
	isScanType,
	listClinics,
	SCAN_TYPE_LABELS,
	SCAN_TYPES,
} from '#/lib/clinics';

export const Route = createFileRoute('/')({
	// Optional key keeps `search` optional on Links to "/".
	validateSearch: (
		search: Record<string, unknown>,
	): { scanType?: ScanType } => ({
		scanType: isScanType(search.scanType) ? search.scanType : undefined,
	}),
	loaderDeps: ({ search }) => ({ scanType: search.scanType }),
	loader: async ({ deps }) =>
		listClinics({ data: { scanType: deps.scanType } }),
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
	const { scanType } = Route.useSearch();

	return (
		<div className="mx-auto max-w-3xl px-4 py-8">
			<header>
				<h1 className="text-4xl font-bold tracking-tight">Referaly</h1>
				<p className="mt-2 text-lg text-neutral-600">
					Imaging clinic wait times in the GTA
				</p>
			</header>

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

			<main className="mt-6">
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
			search={search}
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

function ClinicCard({ clinic }: { clinic: ClinicDirectoryEntry }) {
	const location = clinic.locations[0];
	return (
		<li className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
			<Link
				to="/clinic/$clinicId"
				params={{ clinicId: clinic.id }}
				className="text-xl font-semibold text-neutral-900 hover:underline"
			>
				{clinic.name}
			</Link>
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
