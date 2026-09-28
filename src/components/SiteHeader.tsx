import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { signOut } from '#/lib/auth-client';
import type { Session } from '#/lib/auth';

export function SiteHeader({ session }: { session: Session | null }) {
	const user = session?.user;
	return (
		<div className="border-b border-neutral-200 bg-white">
			<div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
				<Link
					to="/"
					className="text-lg font-bold tracking-tight text-neutral-900"
				>
					Referaly
				</Link>
				{user ? (
					<UserMenu name={user.name} email={user.email} />
				) : (
					<Link
						to="/sign-in"
						className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100"
					>
						Sign in
					</Link>
				)}
			</div>
		</div>
	);
}

function UserMenu({ name, email }: { name: string; email: string }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [signingOut, setSigningOut] = useState(false);

	async function handleSignOut() {
		setSigningOut(true);
		await signOut();
		// Full reload so SSR session state refreshes everywhere.
		window.location.href = '/';
	}

	const initial = (name || email || '?').trim().charAt(0).toUpperCase();

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
				aria-haspopup="menu"
				className="flex items-center gap-2 rounded-full border border-neutral-200 py-1.5 pl-1.5 pr-3 transition-colors hover:shadow-md"
			>
				<span
					aria-hidden="true"
					className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-600 text-sm font-semibold text-white"
				>
					{initial}
				</span>
				<span className="max-w-32 truncate text-sm font-medium text-neutral-900">
					{name || email}
				</span>
			</button>
			{open && (
				<>
					<button
						type="button"
						aria-hidden="true"
						tabIndex={-1}
						onClick={() => setOpen(false)}
						className="fixed inset-0 z-10 cursor-default bg-transparent"
					/>
					<div
						role="menu"
						className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl"
					>
						<div className="px-3 py-2">
							<p className="truncate text-sm font-medium text-neutral-900">
								{name || 'Account'}
							</p>
							<p className="truncate text-xs text-neutral-500">{email}</p>
						</div>
						<div className="my-1 h-px bg-neutral-100" />
						<button
							type="button"
							role="menuitem"
							disabled={signingOut}
							onClick={() => {
								setOpen(false);
								void navigate({ to: '/' });
							}}
							className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100"
						>
							My account
						</button>
						<button
							type="button"
							role="menuitem"
							disabled={signingOut}
							onClick={() => void handleSignOut()}
							className="w-full rounded-xl px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50"
						>
							{signingOut ? 'Signing out…' : 'Sign out'}
						</button>
					</div>
				</>
			)}
		</div>
	);
}
