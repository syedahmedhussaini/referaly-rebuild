import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({ component: Home });

function Home() {
	return (
		<div className="mx-auto max-w-2xl p-8">
			<h1 className="text-4xl font-bold tracking-tight">Referaly</h1>
			<p className="mt-4 text-lg text-neutral-600">
				Imaging clinic wait times in the GTA — rebuild in progress.
			</p>
			<div className="mt-8 rounded-lg border border-neutral-200 p-6">
				<h2 className="font-semibold">Phase 0 status</h2>
				<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-neutral-600">
					<li>TanStack Start app with SSR</li>
					<li>
						Postgres + PostGIS schema (clinics, locations, services, wait times)
					</li>
					<li>Better Auth: email/password now, Google OAuth when configured</li>
				</ul>
				<p className="mt-4 text-sm text-neutral-500">
					Auth endpoints are live at <code>/api/auth/*</code>. The directory,
					map search, and clinic accounts land in Phases 1–3.
				</p>
			</div>
		</div>
	);
}
