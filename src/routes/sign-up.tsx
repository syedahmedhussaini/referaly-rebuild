import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useState } from 'react';
import { signIn, signUp } from '#/lib/auth-client';
import { getAuthConfig, getSession } from '#/lib/session';

export const Route = createFileRoute('/sign-up')({
	beforeLoad: async () => {
		const session = await getSession();
		if (session?.user) {
			throw redirect({ to: '/' });
		}
	},
	loader: async () => getAuthConfig(),
	head: () => ({
		meta: [{ title: 'Create account — Referaly' }],
	}),
	component: SignUpPage,
});

function SignUpPage() {
	const { googleEnabled } = Route.useLoaderData();
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		setPending(true);
		const { error } = await signUp.email({
			name: name.trim(),
			email: email.trim(),
			password,
		});
		setPending(false);
		if (error) {
			setError(error.message || 'Could not create your account. Try again.');
			return;
		}
		window.location.href = '/';
	}

	return (
		<div className="mx-auto max-w-md px-4 py-12">
			<h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
			<p className="mt-1 text-sm text-neutral-600">
				Report wait times, save clinics, and more.
			</p>

			{googleEnabled && (
				<>
					<button
						type="button"
						onClick={() => void signIn.social({ provider: 'google' })}
						className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-neutral-300 py-2.5 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-50"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
							<path
								fill="#4285F4"
								d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"
							/>
							<path
								fill="#34A853"
								d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z"
							/>
							<path
								fill="#FBBC05"
								d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z"
							/>
							<path
								fill="#EA4335"
								d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
							/>
						</svg>
						Continue with Google
					</button>
					<div className="my-4 flex items-center gap-3 text-xs text-neutral-400">
						<span className="h-px flex-1 bg-neutral-200" />
						or
						<span className="h-px flex-1 bg-neutral-200" />
					</div>
				</>
			)}

			<form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
				<label className="block">
					<span className="mb-1 block text-sm font-medium text-neutral-900">
						Name
					</span>
					<input
						type="text"
						required
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
						placeholder="Jane Doe"
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-sm font-medium text-neutral-900">
						Email
					</span>
					<input
						type="email"
						required
						autoComplete="email"
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
						placeholder="you@example.com"
					/>
				</label>
				<label className="block">
					<span className="mb-1 block text-sm font-medium text-neutral-900">
						Password
					</span>
					<input
						type="password"
						required
						minLength={8}
						autoComplete="new-password"
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="w-full rounded-xl border border-neutral-300 px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900"
						placeholder="At least 8 characters"
					/>
				</label>
				{error && (
					<p role="alert" className="text-sm text-red-600">
						{error}
					</p>
				)}
				<button
					type="submit"
					disabled={pending}
					className="w-full rounded-full bg-rose-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
				>
					{pending ? 'Creating account…' : 'Create account'}
				</button>
			</form>

			<p className="mt-6 text-center text-sm text-neutral-600">
				Already have an account?{' '}
				<Link to="/sign-in" className="font-medium text-neutral-900 underline">
					Sign in
				</Link>
			</p>
		</div>
	);
}
