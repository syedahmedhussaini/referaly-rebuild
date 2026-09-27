import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { useEffect, useRef, useState } from 'react';
import { SCAN_TYPE_LABELS, type ScanType } from '#/lib/clinics';
import { getClinicsInBounds, type MapClinic } from '#/lib/map';

/** Default viewport: downtown Toronto. */
const DEFAULT_CENTER = { lat: 43.6532, lng: -79.3832 };
const DEFAULT_ZOOM = 10;
/** Refetch the viewport query this long after the user stops panning/zooming. */
const REFETCH_DEBOUNCE_MS = 350;

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

/** InfoWindow body: clinic name, service chips, link to the detail page. */
function infoWindowContent(clinic: MapClinic): string {
	const chips = clinic.services
		.map(
			(s) =>
				`<span class="inline-block rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700">${escapeHtml(SCAN_TYPE_LABELS[s])}</span>`,
		)
		.join(' ');
	return `
		<div class="max-w-56 p-1">
			<p class="text-sm font-semibold text-neutral-900">${escapeHtml(clinic.name)}</p>
			${chips ? `<div class="mt-1.5 flex flex-wrap gap-1">${chips}</div>` : ''}
			<a href="/clinic/${encodeURIComponent(clinic.clinicId)}" class="mt-2 inline-block text-sm font-medium text-blue-700 hover:underline">View details &rarr;</a>
		</div>`;
}

type MapStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Airbnb-style clinic map. Markers come from the PostGIS viewport query and
 * refetch (debounced) on pan/zoom; markers cluster via MarkerClusterer.
 * Renders a graceful fallback when no browser API key is configured.
 */
export function ClinicMap({ scanType }: { scanType: ScanType | undefined }) {
	const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
	const containerRef = useRef<HTMLDivElement>(null);
	const refetchRef = useRef<() => void>(() => {});
	const scanTypeRef = useRef(scanType);
	scanTypeRef.current = scanType;
	const [status, setStatus] = useState<MapStatus>('loading');

	// Initialize the map once (client-side only — runs inside useEffect).
	// apiKey is a build-time constant (import.meta.env), so empty deps are correct.
	useEffect(() => {
		if (!apiKey || !containerRef.current) return;
		let cancelled = false;
		let debounce: ReturnType<typeof setTimeout> | undefined;
		let listener: google.maps.MapsEventListener | undefined;
		let clusterer: MarkerClusterer | null = null;
		let infoWindow: google.maps.InfoWindow | null = null;

		async function boot() {
			// Idempotent: same options on re-mount are a no-op.
			setOptions({ key: apiKey as string, v: 'weekly' });
			const { Map: GoogleMap, InfoWindow: GoogleInfoWindow } =
				await importLibrary('maps');
			const { Marker } = await importLibrary('marker');
			if (cancelled || !containerRef.current) return;

			const map = new GoogleMap(containerRef.current, {
				center: DEFAULT_CENTER,
				zoom: DEFAULT_ZOOM,
				mapTypeControl: false,
				streetViewControl: false,
				fullscreenControl: false,
			});
			clusterer = new MarkerClusterer({ map });

			async function fetchMarkers() {
				const bounds = map.getBounds();
				if (!bounds) return;
				const ne = bounds.getNorthEast();
				const sw = bounds.getSouthWest();
				try {
					const data = await getClinicsInBounds({
						data: {
							bbox: {
								minLng: sw.lng(),
								minLat: sw.lat(),
								maxLng: ne.lng(),
								maxLat: ne.lat(),
							},
							scanType: scanTypeRef.current,
						},
					});
					if (cancelled) return;
					clusterer?.clearMarkers();
					const markers = data.map((clinic) => {
						const marker = new Marker({
							position: { lat: clinic.lat, lng: clinic.lng },
							title: clinic.name,
						});
						marker.addListener('click', () => {
							infoWindow?.close();
							infoWindow = new GoogleInfoWindow({
								content: infoWindowContent(clinic),
							});
							infoWindow.open({ map, anchor: marker });
						});
						return marker;
					});
					clusterer?.addMarkers(markers);
					setStatus(data.length === 0 ? 'empty' : 'ready');
				} catch {
					if (!cancelled) setStatus('error');
				}
			}

			refetchRef.current = () => {
				void fetchMarkers();
			};
			listener = map.addListener('bounds_changed', () => {
				if (debounce) clearTimeout(debounce);
				debounce = setTimeout(() => {
					void fetchMarkers();
				}, REFETCH_DEBOUNCE_MS);
			});
			void fetchMarkers();
		}

		boot().catch(() => {
			if (!cancelled) setStatus('error');
		});

		return () => {
			cancelled = true;
			if (debounce) clearTimeout(debounce);
			listener?.remove();
			infoWindow?.close();
			clusterer?.clearMarkers();
			clusterer = null;
		};
	}, []);

	// Refetch markers when the scan-type filter changes. The filter value is
	// read via scanTypeRef inside fetchMarkers; the dep below re-runs this
	// effect intentionally.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional re-run on filter change
	useEffect(() => {
		refetchRef.current();
	}, [scanType]);

	if (!apiKey) {
		return (
			<div
				role="note"
				className="flex h-full min-h-64 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center"
			>
				<p className="max-w-xs text-sm text-neutral-500">
					Map unavailable — set{' '}
					<code className="rounded bg-neutral-200 px-1 font-mono text-xs">
						VITE_GOOGLE_MAPS_API_KEY
					</code>{' '}
					to enable the clinic map.
				</p>
			</div>
		);
	}

	return (
		<div className="relative h-full min-h-64 overflow-hidden rounded-lg border border-neutral-200">
			<div ref={containerRef} className="absolute inset-0" />
			{status === 'loading' && (
				<div className="absolute inset-0 flex items-center justify-center bg-white/70">
					<p className="text-sm text-neutral-500">Loading map…</p>
				</div>
			)}
			{status === 'empty' && (
				<div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
					<p className="rounded-full bg-white/95 px-4 py-1.5 text-xs font-medium text-neutral-600 shadow">
						No clinics in this area yet
					</p>
				</div>
			)}
			{status === 'error' && (
				<div className="absolute inset-0 flex items-center justify-center bg-white/80">
					<p className="max-w-xs px-4 text-center text-sm text-neutral-500">
						Couldn&apos;t load map data. Check your connection and API key, then
						try again.
					</p>
				</div>
			)}
		</div>
	);
}
