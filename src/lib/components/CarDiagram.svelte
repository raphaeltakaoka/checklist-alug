<script>
	// Svelte 5 Runes for properties
	let { activePart = $bindable(), partStates = {} } = $props();

	function handleKeyDown(event, partId) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			activePart = partId;
		}
	}

	// List of all inspectable parts
	const parts = [
		{ id: "front_bumper", name: "Parachoque Dianteiro", x: "42%", y: "5%" },
		{ id: "hood", name: "Capô", x: "42%", y: "16%" },
		{ id: "windshield", name: "Parabrisa", x: "42%", y: "28%" },
		{ id: "roof", name: "Teto", x: "42%", y: "45%" },
		{ id: "rear_glass", name: "Vidro Traseiro", x: "42%", y: "63%" },
		{ id: "trunk", name: "Porta-Malas / Traseira", x: "42%", y: "78%" },
		{ id: "rear_bumper", name: "Parachoque Traseiro", x: "42%", y: "90%" },

		// Left Side
		{ id: "left_fender", name: "Paralama Diant. Esq.", x: "18%", y: "16%" },
		{
			id: "left_front_door",
			name: "Porta Diant. Esq.",
			x: "18%",
			y: "36%",
		},
		{
			id: "left_front_window",
			name: "Vidro Diant. Esq.",
			x: "32%",
			y: "42%",
		},
		{ id: "left_rear_door", name: "Porta Tras. Esq.", x: "18%", y: "54%" },
		{
			id: "left_rear_window",
			name: "Vidro Tras. Esq.",
			x: "32%",
			y: "52%",
		},
		{
			id: "left_rear_quarter",
			name: "Lateral Tras. Esq.",
			x: "18%",
			y: "73%",
		},

		// Right Side
		{
			id: "right_fender",
			name: "Paralama Diant. Dir.",
			x: "66%",
			y: "16%",
		},
		{
			id: "right_front_door",
			name: "Porta Diant. Dir.",
			x: "66%",
			y: "36%",
		},
		{
			id: "right_front_window",
			name: "Vidro Diant. Dir.",
			x: "58%",
			y: "42%",
		},
		{ id: "right_rear_door", name: "Porta Tras. Dir.", x: "66%", y: "54%" },
		{
			id: "right_rear_window",
			name: "Vidro Tras. Dir.",
			x: "58%",
			y: "52%",
		},
		{
			id: "right_rear_quarter",
			name: "Lateral Tras. Dir.",
			x: "66%",
			y: "73%",
		},

		// Add-ons
		{
			id: "interior",
			name: "Interior da Cabine",
			x: "42%",
			y: "54%",
			isSpecial: true,
		},
		{
			id: "left_front_wheel",
			name: "Roda Diant. Esq.",
			x: "18%",
			y: "16%",
		},
		{
			id: "right_front_wheel",
			name: "Roda Diant. Dir.",
			x: "66%",
			y: "16%",
		},
		{
			id: "left_rear_wheel",
			name: "Roda Tras. Esq.",
			x: "18%",
			y: "73%",
		},
		{
			id: "right_rear_wheel",
			name: "Roda Tras. Dir.",
			x: "66%",
			y: "73%",
		},
	];

	// Get color badge classes based on status
	function getStatusColor(partId) {
		const state = partStates[partId];
		if (!state || state.status === "none") {
			return "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-slate-100 dark:hover:bg-slate-700/80 text-slate-700 dark:text-slate-300";
		}
		if (state.status === "scratch") {
			return "bg-amber-50 dark:bg-amber-500/20 border-amber-300 dark:border-amber-500 text-amber-700 dark:text-amber-300 hover:bg-amber-100/80 dark:hover:bg-amber-500/30";
		}
		if (state.status === "dent") {
			return "bg-orange-50 dark:bg-orange-500/20 border-orange-300 dark:border-orange-500 text-orange-700 dark:text-orange-300 hover:bg-orange-100/80 dark:hover:bg-orange-500/30";
		}
		if (state.status === "crack") {
			return "bg-purple-50 dark:bg-purple-500/20 border-purple-300 dark:border-purple-500 text-purple-700 dark:text-purple-300 hover:bg-purple-100/80 dark:hover:bg-purple-500/30";
		}
		if (state.status === "broken") {
			return "bg-red-50 dark:bg-red-500/20 border-red-300 dark:border-red-500 text-red-600 dark:text-red-400 hover:bg-red-100/80 dark:hover:bg-red-500/30 animate-pulse";
		}
		return "bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-750 dark:text-slate-300";
	}

	function getSVGPartColor(partId) {
		const state = partStates[partId];
		if (!state || state.status === "none") {
			if (partId.endsWith("_wheel")) {
				return "fill-slate-700 dark:fill-slate-950 stroke-slate-400 dark:stroke-slate-700 hover:fill-slate-650 dark:hover:fill-slate-900";
			}
			return "fill-slate-100/60 dark:fill-slate-800/50 stroke-slate-300 dark:stroke-slate-600 hover:fill-slate-200/50 dark:hover:fill-slate-700/50";
		}
		if (state.status === "scratch")
			return "fill-amber-100/60 dark:fill-amber-500/40 stroke-amber-500 dark:stroke-amber-500";
		if (state.status === "dent")
			return "fill-orange-100/60 dark:fill-orange-500/40 stroke-orange-500 dark:stroke-orange-500";
		if (state.status === "crack")
			return "fill-purple-100/60 dark:fill-purple-500/40 stroke-purple-500 dark:stroke-purple-500";
		if (state.status === "broken")
			return "fill-red-150 dark:fill-red-500/50 stroke-red-500 dark:stroke-red-500";
		return "fill-slate-100/60 dark:fill-slate-800/50 stroke-slate-300 dark:stroke-slate-600";
	}
</script>

<div
	class="w-full flex flex-col lg:flex-row items-stretch lg:items-start justify-center gap-6 lg:gap-10 p-0 bg-transparent border-transparent shadow-none"
>
	<!-- Visual Blueprint (SVG) -->
	<div
		class="relative w-full max-w-[450px] aspect-2/5 p-0 flex items-center justify-center mx-auto"
	>
		<!-- Dynamic Interactive Car SVG Outline -->
		<svg viewBox="20 0 160 400" class="w-full h-full select-none">
			<!-- Main Car Chassis Body Shadow -->
			<rect
				x="35"
				y="25"
				width="130"
				height="340"
				rx="35"
				fill="none"
				stroke="rgba(59, 130, 246, 0.1)"
				stroke-width="8"
			/>

			<!-- Wheels -->
			<rect
				x="22"
				y="55"
				width="15"
				height="40"
				rx="4"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_front_wheel',
				)} {activePart === 'left_front_wheel'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_front_wheel")}
				onkeydown={(e) => handleKeyDown(e, "left_front_wheel")}
			/>
			<rect
				x="163"
				y="55"
				width="15"
				height="40"
				rx="4"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_front_wheel',
				)} {activePart === 'right_front_wheel'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_front_wheel")}
				onkeydown={(e) => handleKeyDown(e, "right_front_wheel")}
			/>
			<rect
				x="22"
				y="275"
				width="15"
				height="40"
				rx="4"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_rear_wheel',
				)} {activePart === 'left_rear_wheel'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_rear_wheel")}
				onkeydown={(e) => handleKeyDown(e, "left_rear_wheel")}
			/>
			<rect
				x="163"
				y="275"
				width="15"
				height="40"
				rx="4"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_rear_wheel',
				)} {activePart === 'right_rear_wheel'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_rear_wheel")}
				onkeydown={(e) => handleKeyDown(e, "right_rear_wheel")}
			/>

			<!-- Front Bumper -->
			<path
				d="M 45,28 C 65,15 135,15 155,28 C 160,33 160,38 150,38 C 120,35 80,35 50,38 C 40,38 40,33 45,28 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'front_bumper',
				)} {activePart === 'front_bumper'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "front_bumper")}
				onkeydown={(e) => handleKeyDown(e, "front_bumper")}
			/>

			<!-- Hood -->
			<path
				d="M 48,42 L 152,42 C 158,80 155,100 148,110 L 52,110 C 45,100 42,80 48,42 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'hood',
				)} {activePart === 'hood'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "hood")}
				onkeydown={(e) => handleKeyDown(e, "hood")}
			/>

			<!-- Windshield -->
			<path
				d="M 54,114 L 146,114 C 143,128 138,135 132,138 L 68,138 C 62,135 57,128 54,114 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'windshield',
				)} {activePart === 'windshield'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "windshield")}
				onkeydown={(e) => handleKeyDown(e, "windshield")}
			/>

			<!-- Roof -->
			<rect
				x="58"
				y="142"
				width="84"
				height="85"
				rx="8"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'roof',
				)} {activePart === 'roof'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "roof")}
				onkeydown={(e) => handleKeyDown(e, "roof")}
			/>

			<!-- Left Front Window -->
			<rect
				x="49"
				y="144"
				width="7"
				height="38"
				rx="2"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_front_window',
				)} {activePart === 'left_front_window'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_front_window")}
				onkeydown={(e) => handleKeyDown(e, "left_front_window")}
			/>

			<!-- Left Rear Window -->
			<rect
				x="49"
				y="186"
				width="7"
				height="38"
				rx="2"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_rear_window',
				)} {activePart === 'left_rear_window'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_rear_window")}
				onkeydown={(e) => handleKeyDown(e, "left_rear_window")}
			/>

			<!-- Right Front Window -->
			<rect
				x="144"
				y="144"
				width="7"
				height="38"
				rx="2"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_front_window',
				)} {activePart === 'right_front_window'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_front_window")}
				onkeydown={(e) => handleKeyDown(e, "right_front_window")}
			/>

			<!-- Right Rear Window -->
			<rect
				x="144"
				y="186"
				width="7"
				height="38"
				rx="2"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_rear_window',
				)} {activePart === 'right_rear_window'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_rear_window")}
				onkeydown={(e) => handleKeyDown(e, "right_rear_window")}
			/>

			<!-- Rear Glass -->
			<path
				d="M 54,248 L 146,248 C 143,234 138,230 132,230 L 68,230 C 62,230 57,234 54,248 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'rear_glass',
				)} {activePart === 'rear_glass'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "rear_glass")}
				onkeydown={(e) => handleKeyDown(e, "rear_glass")}
			/>

			<!-- Trunk -->
			<path
				d="M 48,252 L 152,252 C 158,285 155,300 148,320 L 52,320 C 45,300 42,285 48,252 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'trunk',
				)} {activePart === 'trunk'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "trunk")}
				onkeydown={(e) => handleKeyDown(e, "trunk")}
			/>

			<!-- Rear Bumper -->
			<path
				d="M 45,342 C 65,355 135,355 155,342 C 160,337 160,332 150,332 C 120,335 80,335 50,332 C 40,332 40,337 45,342 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'rear_bumper',
				)} {activePart === 'rear_bumper'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "rear_bumper")}
				onkeydown={(e) => handleKeyDown(e, "rear_bumper")}
			/>

			<!-- Left Side Panels -->
			<!-- Front Fender -->
			<path
				d="M 38,40 C 36,60 36,80 38,98 L 44,98 C 42,80 44,55 46,40 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_fender',
				)} {activePart === 'left_fender'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_fender")}
				onkeydown={(e) => handleKeyDown(e, "left_fender")}
			/>

			<!-- Front Door -->
			<path
				d="M 36,102 C 34,120 34,140 36,160 L 48,160 L 48,102 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_front_door',
				)} {activePart === 'left_front_door'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_front_door")}
				onkeydown={(e) => handleKeyDown(e, "left_front_door")}
			/>

			<!-- Rear Door -->
			<path
				d="M 36,164 C 34,184 34,210 36,228 L 48,228 L 48,164 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_rear_door',
				)} {activePart === 'left_rear_door'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_rear_door")}
				onkeydown={(e) => handleKeyDown(e, "left_rear_door")}
			/>

			<!-- Rear Quarter -->
			<path
				d="M 38,232 C 36,252 36,280 38,320 L 46,320 C 44,285 44,250 48,232 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'left_rear_quarter',
				)} {activePart === 'left_rear_quarter'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "left_rear_quarter")}
				onkeydown={(e) => handleKeyDown(e, "left_rear_quarter")}
			/>

			<!-- Right Side Panels -->
			<!-- Front Fender -->
			<path
				d="M 162,40 C 164,60 164,80 162,98 L 156,98 C 158,80 156,55 154,40 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_fender',
				)} {activePart === 'right_fender'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_fender")}
				onkeydown={(e) => handleKeyDown(e, "right_fender")}
			/>

			<!-- Front Door -->
			<path
				d="M 164,102 C 166,120 166,140 164,160 L 152,160 L 152,102 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_front_door',
				)} {activePart === 'right_front_door'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_front_door")}
				onkeydown={(e) => handleKeyDown(e, "right_front_door")}
			/>

			<!-- Rear Door -->
			<path
				d="M 164,164 C 166,184 166,210 164,228 L 152,228 L 152,164 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_rear_door',
				)} {activePart === 'right_rear_door'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_rear_door")}
				onkeydown={(e) => handleKeyDown(e, "right_rear_door")}
			/>

			<!-- Rear Quarter -->
			<path
				d="M 162,232 C 164,252 164,280 162,320 L 154,320 C 156,285 156,250 152,232 Z"
				class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
					'right_rear_quarter',
				)} {activePart === 'right_rear_quarter'
					? 'stroke-blue-500 dark:stroke-blue-400 stroke-[2px]'
					: 'stroke-1'}"
				role="button"
				tabindex="0"
				onclick={() => (activePart = "right_rear_quarter")}
				onkeydown={(e) => handleKeyDown(e, "right_rear_quarter")}
			/>

			<!-- Labels inside SVG -->
			<text
				x="100"
				y="32"
				font-size="8"
				fill="#94a3b8"
				text-anchor="middle"
				font-weight="bold"
				pointer-events="none">FRENTE</text
			>
			<text
				x="100"
				y="348"
				font-size="8"
				fill="#94a3b8"
				text-anchor="middle"
				font-weight="bold"
				pointer-events="none">TRASEIRA</text
			>
		</svg>
	</div>

	<!-- Interactive List / Panel Grid -->
	<div class="flex-1 w-full">
		<h3
			class="text-lg font-bold text-slate-800 dark:text-slate-200 mb-4 flex items-center justify-between"
		>
			<span>Partes do Carro</span>
		</h3>

		<div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
			{#each parts as part}
				<button
					type="button"
					onclick={() => (activePart = part.id)}
					class="flex flex-col text-left p-3 rounded-xl border transition-all duration-200 cursor-pointer outline-none relative group {getStatusColor(
						part.id,
					)} {activePart === part.id
						? 'ring-2 ring-blue-500 border-blue-500 scale-[1.02] shadow-lg shadow-blue-500/10'
						: ''}"
				>
					<span class="text-sm font-semibold truncate"
						>{part.name}</span
					>

					<div class="flex items-center gap-1.5 mt-1">
						{#if partStates[part.id] && partStates[part.id].status !== "none"}
							<span
								class="text-[10px] uppercase font-bold tracking-wider"
							>
								{partStates[part.id].status}
							</span>
							{#if partStates[part.id].photos?.length > 0}
								<span
									class="w-1.5 h-1.5 rounded-full bg-blue-400"
									title="{partStates[part.id].photos
										.length} photo(s)"
								></span>
							{/if}
							{#if partStates[part.id].comments}
								<span
									class="text-[10px] text-slate-400 dark:text-slate-500"
									>💬</span
								>
							{/if}
						{:else}
							<span
								class="text-[10px] text-slate-400 dark:text-slate-500 uppercase"
								>Sem Danos</span
							>
						{/if}
					</div>

					<!-- Hover glow -->
					<div
						class="absolute inset-0 rounded-xl bg-linear-to-tr from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
					></div>
				</button>
			{/each}
		</div>
	</div>
</div>
