import { TanStackDevtools } from '@tanstack/react-devtools';
import { createRootRoute, HeadContent, Scripts } from '@tanstack/react-router';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import appCss from '../styles.css?url';

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{
				charSet: 'utf-8',
			},
			{
				name: 'viewport',
				content: 'width=device-width, initial-scale=1',
			},
			{
				title: 'Referaly — Imaging Clinic Wait Times in the GTA',
			},
		],
		links: [
			{
				rel: 'stylesheet',
				href: appCss,
			},
		],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
				{/* Recover from stale chunk 404s after a redeploy: the browser may
				    hold HTML from deployment N while the CDN serves deployment N+1,
				    so a lazy route chunk fails with "Failed to fetch dynamically
				    imported module". Reload once (max 1/min) to pick up fresh HTML. */}
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){var k='referaly-chunk-reload-ts';window.addEventListener('error',function(e){var m=String((e&&e.message)||'');if(m.indexOf('Failed to fetch dynamically imported module')===-1&&m.indexOf('Importing a module script failed')===-1)return;try{var last=Number(sessionStorage.getItem(k)||0);if(Date.now()-last>60000){sessionStorage.setItem(k,String(Date.now()));window.location.reload();}}catch(_){window.location.reload();}},true);})();`,
					}}
				/>
			</head>
			<body>
				{children}
				<TanStackDevtools
					config={{
						position: 'bottom-right',
					}}
					plugins={[
						{
							name: 'Tanstack Router',
							render: <TanStackRouterDevtoolsPanel />,
						},
					]}
				/>
				<Scripts />
			</body>
		</html>
	);
}
