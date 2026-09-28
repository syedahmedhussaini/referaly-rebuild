import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { useEffect, useRef, useState } from 'react';
import {
	isScanType,
	SCAN_TYPE_LABELS,
	SCAN_TYPES,
	type ScanType,
} from '#/lib/clinics';

export interface SearchValues {
	scanType?: ScanType;
	lat?: number;
	lng?: number;
	label?: string;
}

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

/** Geocode a free-text address with the client-side Geocoder. */
async function geocodeAddress(
	text: string,
): Promise<{ lat: number; lng: number; label: string } | null> {
	if (!apiKey) return null;
	setOptions({ key: apiKey, v: 'weekly' });
	const { Geocoder } = await importLibrary('geocoding');
	const geocoder = new Geocoder();
	const result = await geocoder.geocode({
		address: text,
		componentRestrictions: { country: 'CA' },
	});
	const first = result.results[0];
	const loc = first?.geometry?.location;
	if (!loc) return null;
	return {
		lat: loc.lat(),
		lng: loc.lng(),
		label: first.formatted_address ?? text,
	};
}

/**
 * Airbnb-style search pill: Where (address autocomplete + current location)
 * | Service (scan-type picker) | round search button. Calls `onSearch` with
 * the resolved values; `initial` seeds the fields from the URL.
 */
export function SearchBar({
	initial,
	onSearch,
}: {
	initial: SearchValues;
	onSearch: (values: SearchValues) => void;
}) {
	const [address, setAddress] = useState(initial.label ?? '');
	const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
		initial.lat != null && initial.lng != null
			? { lat: initial.lat, lng: initial.lng }
			: null,
	);
	const [service, setService] = useState<ScanType | undefined>(initial.scanType);
	const [serviceOpen, setServiceOpen] = useState(false);
	const [whereOpen, setWhereOpen] = useState(false);
	const [locating, setLocating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// Sync when the URL search changes (e.g. filter tabs, clear chip).
	useEffect(() => {
		setAddress(initial.label ?? '');
		setCoords(
			initial.lat != null && initial.lng != null
				? { lat: initial.lat, lng: initial.lng }
				: null,
		);
		setService(initial.scanType);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [initial.label, initial.lat, initial.lng, initial.scanType]);

	// Attach Google Places Autocomplete to the Where input (Canada only).
	useEffect(() => {
		if (!apiKey || !inputRef.current) return;
		let autocomplete: google.maps.places.Autocomplete | null = null;
		let cancelled = false;
		(async () => {
			setOptions({ key: apiKey, v: 'weekly' });
			const { Autocomplete } = await importLibrary('places');
			if (cancelled || !inputRef.current) return;
			autocomplete = new Autocomplete(inputRef.current, {
				types: ['address'],
				componentRestrictions: { country: 'ca' },
				fields: ['geometry', 'formatted_address'],
			});
			autocomplete.addListener('place_changed', () => {
				const place = autocomplete?.getPlace();
				const loc = place?.geometry?.location;
				if (loc && inputRef.current) {
					setCoords({ lat: loc.lat(), lng: loc.lng() });
					const label = place?.formatted_address ?? inputRef.current.value;
					setAddress(label);
					setError(null);
				}
			});
		})().catch(() => {});
		return () => {
			cancelled = true;
			if (autocomplete) google.maps.event.clearInstanceListeners(autocomplete);
		};
	}, []);

	function useCurrentLocation() {
		if (!('geolocation' in navigator)) {
			setError('Geolocation is not supported by this browser.');
			return;
		}
		setLocating(true);
		setWhereOpen(false);
		setError(null);
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
				setAddress('Current location');
				setLocating(false);
			},
			() => {
				setError('Could not get your location. Check permissions and try again.');
				setLocating(false);
			},
			{ timeout: 10000 },
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		let resolved = coords;
		const typed = address.trim();
		if (typed && !resolved) {
			// User typed an address without picking a suggestion — geocode it.
			try {
				const hit = await geocodeAddress(typed);
				if (!hit) {
					setError('Could not find that address. Try picking a suggestion.');
					return;
				}
				resolved = { lat: hit.lat, lng: hit.lng };
				setAddress(hit.label);
			} catch {
				setError('Address lookup failed. Try again.');
				return;
			}
		}
		onSearch({
			scanType: service,
			lat: resolved?.lat,
			lng: resolved?.lng,
			label: resolved ? address.trim() || 'Current location' : undefined,
		});
	}

	return (
		<div>
			<form
				onSubmit={handleSubmit}
				role="search"
				aria-label="Search clinics"
				className="mx-auto mt-6 flex max-w-2xl flex-col gap-1 rounded-3xl border border-neutral-200 bg-white p-2 shadow-[0_6px_20px_rgba(0,0,0,0.08)] sm:flex-row sm:items-stretch sm:rounded-full"
			>
				{/* Where */}
				<div className="relative flex-1">
					<label className="block rounded-2xl px-5 py-2 transition-colors hover:bg-neutral-100 sm:rounded-full">
						<span className="block text-[11px] font-bold uppercase tracking-wider text-neutral-900">
							Where
						</span>
						<input
							ref={inputRef}
							value={address}
							onChange={(e) => {
								setAddress(e.target.value);
								if (e.target.value.trim() === '') setCoords(null);
							}}
							onFocus={() => setWhereOpen(true)}
							placeholder="Search by address"
							autoComplete="off"
							aria-expanded={whereOpen}
							aria-haspopup="listbox"
							className="w-full bg-transparent text-sm text-neutral-700 outline-none placeholder:text-neutral-400"
						/>
					</label>
					{whereOpen && address.trim() === '' && (
						<>
							<button
								type="button"
								aria-hidden="true"
								tabIndex={-1}
								onClick={() => setWhereOpen(false)}
								className="fixed inset-0 z-10 cursor-default bg-transparent"
							/>
							<ul
								role="listbox"
								aria-label="Location options"
								className="absolute z-20 mt-1 w-64 rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl"
							>
								<li role="option" aria-selected={false}>
									<button
										type="button"
										onClick={useCurrentLocation}
										disabled={locating}
										className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors hover:bg-neutral-100 disabled:opacity-50"
									>
										{locating ? (
											<span className="block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-700" />
										) : (
											<svg
												width="16"
												height="16"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
												aria-hidden="true"
												className="shrink-0"
											>
												<circle cx="12" cy="12" r="7" />
												<circle cx="12" cy="12" r="1.5" fill="currentColor" />
												<path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
											</svg>
										)}
										<span>
											<span className="block font-medium text-neutral-900">
												Use current location
											</span>
											<span className="block text-xs text-neutral-500">
												Find clinics near you
											</span>
										</span>
									</button>
								</li>
							</ul>
						</>
					)}
				</div>

				<div
					aria-hidden="true"
					className="hidden w-px self-stretch bg-neutral-200 sm:block"
				/>

				{/* Service */}
				<div className="relative sm:w-44 sm:shrink-0">
					<button
						type="button"
						onClick={() => setServiceOpen((o) => !o)}
						aria-expanded={serviceOpen}
						aria-haspopup="listbox"
						className="w-full rounded-2xl px-5 py-2 text-left transition-colors hover:bg-neutral-100 sm:rounded-full"
					>
						<span className="block text-[11px] font-bold uppercase tracking-wider text-neutral-900">
							Service
						</span>
						<span className="block truncate text-sm text-neutral-700">
							{service ? SCAN_TYPE_LABELS[service] : 'Select service'}
						</span>
					</button>
					{serviceOpen && (
						<>
							<button
								type="button"
								aria-hidden="true"
								tabIndex={-1}
								onClick={() => setServiceOpen(false)}
								className="fixed inset-0 z-10 cursor-default bg-transparent"
							/>
							<ul
								role="listbox"
								aria-label="Service"
								className="absolute z-20 mt-1 max-h-72 w-56 overflow-auto rounded-2xl border border-neutral-200 bg-white p-1.5 shadow-xl"
							>
								<ServiceOption
									label="Any service"
									selected={service === undefined}
									onSelect={() => {
										setService(undefined);
										setServiceOpen(false);
									}}
								/>
								{SCAN_TYPES.map((st) => (
									<ServiceOption
										key={st}
										label={SCAN_TYPE_LABELS[st]}
										selected={service === st}
										onSelect={() => {
											setService(st);
											setServiceOpen(false);
										}}
									/>
								))}
							</ul>
						</>
					)}
				</div>

				{/* Search button */}
				<button
					type="submit"
					className="flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-rose-700 sm:w-12 sm:shrink-0 sm:rounded-full sm:px-0"
				>
					<svg
						width="16"
						height="16"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						aria-hidden="true"
					>
						<circle cx="11" cy="11" r="7" />
						<path d="M21 21l-4.3-4.3" />
					</svg>
					<span className="sm:hidden">Search</span>
				</button>
			</form>
			{error && (
				<p role="alert" className="mx-auto mt-2 max-w-2xl text-center text-sm text-red-600">
					{error}
				</p>
			)}
		</div>
	);
}

function ServiceOption({
	label,
	selected,
	onSelect,
}: {
	label: string;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<li role="option" aria-selected={selected}>
			<button
				type="button"
				onClick={onSelect}
				className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-neutral-100 ${
					selected ? 'font-semibold text-neutral-900' : 'text-neutral-700'
				}`}
			>
				{label}
				{selected && (
					<svg
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="3"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<path d="M20 6L9 17l-5-5" />
					</svg>
				)}
			</button>
		</li>
	);
}

/** Type guard for the service picker (re-exported for the route). */
export function toScanType(value: string | undefined): ScanType | undefined {
	return isScanType(value) ? value : undefined;
}
