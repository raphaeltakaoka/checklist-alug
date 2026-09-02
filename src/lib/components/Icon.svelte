<script>
	let { name, size = 20, class: className = '' } = $props();
	const paths = {
		home: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
		list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
		tasks: 'm3 6 2 2 4-4m-6 9 2 2 4-4M13 6h8M13 13h8M3 20h18',
		plus: 'M12 5v14M5 12h14',
		arrow: 'M5 12h14m-6-6 6 6-6 6',
		back: 'M19 12H5m6-6-6 6 6 6',
		chevron: 'm9 5 7 7-7 7',
		close: 'm6 6 12 12M6 18 18 6',
		check: 'm5 12 4 4L19 6',
		search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
		user: 'M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
		bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
		logout: 'M9 3H4v18h5m6-14 5 5-5 5M9 12h11',
		cloud: 'M7 18h11a4 4 0 0 0 0-8 6 6 0 0 0-12-1 4.5 4.5 0 0 0 1 9',
		offline:
			'm3 3 18 18M8 8a6 6 0 0 0-2 1 4.5 4.5 0 0 0 1 9h10M12 4a6 6 0 0 1 6 6 4 4 0 0 1 3 6',
		refresh: 'M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M5 15a8 8 0 0 0 13 3',
		clock: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M12 6v6l4 2',
		alert: 'm12 3 10 18H2Zm0 5v5m0 4h.01',
		camera: 'M9 4h6l2 3h4v14H3V7h4ZM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
		image: 'M3 3h18v18H3Zm0 13 5-5 5 5 3-3 5 5M15 7h.01',
		trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
		edit: 'm15 4 5 5M4 20l5-1L21 7l-5-5L4 14Z',
		print: 'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6ZM17 12h.01',
		eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
		file: 'M14 2H4v20h16V8Zm0 0v6h6M8 13h8M8 17h5',
		external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
		car: 'm5 6-3 7v6h3v-3h14v3h3v-6l-3-7ZM2 12h20M6 14h.01M18 14h.01',
		save: 'M4 3h13l4 4v14H3V3Zm3 0v6h9V3M7 21v-8h10v8'
	};
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.7"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"><path d={paths[name] || paths.file} /></svg
>
