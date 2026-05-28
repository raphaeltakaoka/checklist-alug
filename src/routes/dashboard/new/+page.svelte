<script>
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import CarDiagram from "$lib/components/CarDiagram.svelte";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import DamageModal from "$lib/components/DamageModal.svelte";
	import { saveInspection, getInspection } from "$lib/db.js";
	import Navbar from "$lib/components/Navbar.svelte";

	// Wizard navigation
	let currentStep = $state(1); // 1: General Info, 2: Interior, 3: Damage Map, 4: Signoff

	// Scroll to top when the step changes
	$effect(() => {
		currentStep;
		if (typeof window !== "undefined") {
			window.scrollTo(0, 0);
		}
	});

	// Unique ID & metadata for draft/completed inspections
	let id = $state("ins-" + crypto.randomUUID());
	let createdAtDate = $state(null);

	// Form states for active inspection
	let licensePlate = $state("");
	let inspectionType = $state("Entrega"); // "Entrega" or "Retirada"
	let inspectorName = $state("");
	let clientName = $state("");
	let inspectionDateTime = $state("");
	let clientLicensePhoto = $state(null);
	let clientSignature = $state(null);

	// Interior & Cabin states
	let mileage = $state("");
	let fuelLevel = $state("4/8");
	let hasDocument = $state(false);
	let hasChildSeat = $state(false);
	let hasEToll = $state(false);

	// Key-value store mapping partId to { status, comments, photos }
	let partStates = $state({});

	// Active part selected in diagram (triggers modal if not null)
	let activePartId = $state(null);

	// Get friendly name for a part ID
	const partNames = {
		front_bumper: "Parachoque Dianteiro",
		hood: "Capô",
		windshield: "Parabrisa",
		roof: "Teto",
		rear_glass: "Vidro Traseiro",
		trunk: "Porta-Malas / Traseira",
		rear_bumper: "Parachoque Traseiro",
		left_fender: "Paralama Diant. Esq.",
		left_front_door: "Porta Diant. Esq.",
		left_front_window: "Vidro Diant. Esq.",
		left_rear_door: "Porta Tras. Esq.",
		left_rear_window: "Vidro Tras. Esq.",
		left_rear_quarter: "Lateral Tras. Esq.",
		right_fender: "Paralama Diant. Dir.",
		right_front_door: "Porta Diant. Dir.",
		right_front_window: "Vidro Diant. Dir.",
		right_rear_door: "Porta Tras. Dir.",
		right_rear_window: "Vidro Tras. Dir.",
		right_rear_quarter: "Lateral Tras. Dir.",
		interior: "Interior da Cabine",
		left_front_wheel: "Roda Diant. Esq.",
		right_front_wheel: "Roda Diant. Dir.",
		left_rear_wheel: "Roda Tras. Esq.",
		right_rear_wheel: "Roda Tras. Dir.",
	};

	const statusLabels = {
		none: "Sem Danos",
		scratch: "Risco",
		dent: "Amassado",
		crack: "Trincado",
		broken: "Quebrado",
	};

	onMount(async () => {
		// Set default datetime
		inspectionDateTime = new Date().toISOString().slice(0, 16);

		// Pre-populate inspector name from authenticated session
		inspectorName = localStorage.getItem("inspectorName") || "";

		// Check if we are resuming an existing draft
		const urlParams = new URLSearchParams(window.location.search);
		const draftId = urlParams.get("id");
		if (draftId) {
			try {
				const draft = await getInspection(draftId);
				if (draft) {
					id = draft.id;
					licensePlate = draft.licensePlate || "";
					inspectionType = draft.inspectionType || "Entrega";
					inspectorName = draft.inspectorName || inspectorName;
					clientName = draft.clientName || "";
					inspectionDateTime =
						draft.inspectionDateTime || inspectionDateTime;
					clientLicensePhoto = draft.clientLicensePhoto || null;
					clientSignature = draft.clientSignature || null;
					mileage = draft.mileage || "";
					fuelLevel = draft.fuelLevel || "4/8";
					hasDocument = draft.hasDocument || false;
					hasChildSeat = draft.hasChildSeat || false;
					hasEToll = draft.hasEToll || false;
					partStates = draft.partStates || {};
					createdAtDate = draft.createdAt || null;
				}
			} catch (e) {
				console.error("Failed to load draft inspection", e);
			}
		}

		// Force light theme
		document.documentElement.classList.remove("dark");
	});

	function handleLicensePhotoUpload(e) {
		const file = e.target.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (event) => {
			clientLicensePhoto = event.target.result;
		};
		reader.readAsDataURL(file);
	}

	function generateMockLicensePhoto() {
		const canvas = document.createElement("canvas");
		canvas.width = 400;
		canvas.height = 250;
		const ctx = canvas.getContext("2d");

		// Slate background for simulated driver's license
		ctx.fillStyle = "#1e293b";
		ctx.fillRect(0, 0, 400, 250);
		ctx.strokeStyle = "#3b82f6";
		ctx.lineWidth = 4;
		ctx.strokeRect(10, 10, 380, 230);

		// Header
		ctx.fillStyle = "#3b82f6";
		ctx.font = "bold 16px sans-serif";
		ctx.fillText("CNH SIMULADA", 30, 40);

		// Details
		ctx.fillStyle = "#e2e8f0";
		ctx.font = "14px sans-serif";
		ctx.fillText(`Cliente: ${clientName || "João Silva"}`, 30, 80);
		ctx.fillText(`Placa: ${licensePlate || "XYZ-1234"}`, 30, 110);
		ctx.fillText("Categoria: B (Veículo Comum)", 30, 140);
		ctx.fillText(`Emitido em: ${new Date().toLocaleDateString()}`, 30, 170);

		// Mock face thumbnail
		ctx.fillStyle = "#475569";
		ctx.fillRect(260, 50, 110, 130);
		ctx.strokeStyle = "#64748b";
		ctx.strokeRect(260, 50, 110, 130);

		ctx.fillStyle = "#cbd5e1";
		ctx.textAlign = "center";
		ctx.font = "12px sans-serif";
		ctx.fillText("FOTO", 315, 120);

		clientLicensePhoto = canvas.toDataURL("image/jpeg");
	}

	async function saveDraft() {
		if (!licensePlate || !clientName) {
			alert("Por favor, insira a placa do veículo e o nome do cliente.");
			return false;
		}

		const newReport = {
			id,
			licensePlate: licensePlate.toUpperCase(),
			inspectionType,
			inspectorName,
			clientName,
			inspectionDateTime,
			clientLicensePhoto,
			clientSignature,
			mileage,
			fuelLevel,
			hasDocument,
			hasChildSeat,
			hasEToll,
			partStates: { ...partStates },
			createdAt: createdAtDate || new Date().toISOString(),
			status: "draft",
		};

		try {
			await saveInspection($state.snapshot(newReport));
			if (!createdAtDate) {
				createdAtDate = newReport.createdAt;
			}
			return true;
		} catch (e) {
			console.error("Failed to save draft to IndexedDB", e);
			alert("Falha ao salvar o rascunho de inspeção.");
			return false;
		}
	}

	async function saveCurrentDraftState() {
		// Only save if general info is filled
		if (!licensePlate || !clientName) return;

		const newReport = {
			id,
			licensePlate: licensePlate.toUpperCase(),
			inspectionType,
			inspectorName,
			clientName,
			inspectionDateTime,
			clientLicensePhoto,
			clientSignature,
			mileage,
			fuelLevel,
			hasDocument,
			hasChildSeat,
			hasEToll,
			partStates: { ...partStates },
			createdAt: createdAtDate || new Date().toISOString(),
			status: "draft",
		};

		try {
			await saveInspection($state.snapshot(newReport));
			if (!createdAtDate) {
				createdAtDate = newReport.createdAt;
			}
		} catch (e) {
			console.error("Failed to save draft state to IndexedDB", e);
		}
	}

	async function goToStep(step) {
		if (step > 1 && currentStep === 1) {
			const saved = await saveDraft();
			if (!saved) return;
		} else {
			await saveCurrentDraftState();
		}
		currentStep = step;
	}

	async function submitInspection() {
		// Validations
		if (!licensePlate || !clientName) {
			alert("Por favor, insira a placa do veículo e o nome do cliente.");
			return;
		}

		if (!clientSignature) {
			alert("A assinatura do cliente é obrigatória.");
			return;
		}

		// Create document
		const newReport = {
			id,
			licensePlate: licensePlate.toUpperCase(),
			inspectionType,
			inspectorName,
			clientName,
			inspectionDateTime,
			clientLicensePhoto,
			clientSignature,
			mileage,
			fuelLevel,
			hasDocument,
			hasChildSeat,
			hasEToll,
			partStates: { ...partStates },
			createdAt: createdAtDate || new Date().toISOString(),
			status: "completed",
			synced: false,
		};

		try {
			await saveInspection($state.snapshot(newReport));
			goto("/dashboard");
		} catch (e) {
			console.error("Failed to save inspection to IndexedDB", e);
			alert("Falha ao salvar o relatório de inspeção.");
		}
	}

	// Count damage issues in an inspection
	function countDamages(states) {
		let count = 0;
		for (const key in states) {
			if (states[key]?.status && states[key].status !== "none") {
				count++;
			}
		}
		return count;
	}

	// Format date and time to dd/mm/yyyy HH:MM
	function formatDateTime(dateTimeStr) {
		if (!dateTimeStr) return "N/A";
		try {
			const d = new Date(dateTimeStr);
			if (isNaN(d.getTime())) return "N/A";
			const day = String(d.getDate()).padStart(2, "0");
			const month = String(d.getMonth() + 1).padStart(2, "0");
			const year = d.getFullYear();
			const hours = String(d.getHours()).padStart(2, "0");
			const minutes = String(d.getMinutes()).padStart(2, "0");
			return `${day}/${month}/${year} ${hours}:${minutes}`;
		} catch (e) {
			return "N/A";
		}
	}
</script>

<svelte:head>
	<title>Nova Inspeção - Checklist Alug</title>
	<meta
		name="description"
		content="Checklist Alug - Suíte premium de inspeção de carros e mapeamento de danos com captura de assinaturas."
	/>
</svelte:head>

<div
	class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans select-none"
>
	<!-- Top Premium Navbar -->
	<Navbar showDashboard={true} />

	<!-- Main Body Wrapper -->
	<main
		class="flex-1 w-full mx-auto p-2 sm:p-6 transition-all duration-300 {currentStep ===
		3
			? 'max-w-none px-2 sm:px-10'
			: 'max-w-7xl'}"
	>
		<!-- STEP-BY-STEP INSPECTION FORM WIZARD -->
		<div
			class="w-full mx-auto space-y-6 transition-all duration-300 {currentStep ===
			3
				? 'max-w-none'
				: 'max-w-4xl'}"
		>
			<!-- Header section -->
			<div
				class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
			>
				<div>
					<h2
						class="text-2xl font-black text-slate-900 dark:text-white"
					>
						Novo Checklist
					</h2>
				</div>

				<!-- Progress Tracker Bar -->
				<div
					class="w-full sm:w-auto flex items-center gap-1 sm:gap-2 bg-slate-200/60 dark:bg-slate-900/60 p-1.5 rounded-xl border border-slate-300/40 dark:border-slate-800/80"
				>
					{#each [{ step: 1, label: "Detalhes", short: "Info" }, { step: 2, label: "Interior", short: "Int" }, { step: 3, label: "Mapa de Danos", short: "Mapa" }, { step: 4, label: "Conclusão", short: "Fim" }] as item}
						<button
							onclick={() => goToStep(item.step)}
							class="flex-1 sm:flex-initial px-2 py-1.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer text-center {currentStep ===
							item.step
								? 'bg-blue-600 text-white shadow-sm'
								: 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-300'}"
						>
							<span class="inline sm:hidden"
								>{item.step}. {item.short}</span
							>
							<span class="hidden sm:inline"
								>{item.step}. {item.label}</span
							>
						</button>
					{/each}
				</div>
			</div>

			<!-- STEP 1: GENERAL INFO -->
			{#if currentStep === 1}
				<div
					class="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl"
				>
					<div
						class="border-b border-slate-100 dark:border-slate-800 pb-4"
					>
						<h3
							class="text-lg font-bold text-slate-800 dark:text-slate-200"
						>
							Detalhes
						</h3>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- Tipo de Inspeção -->
						<div class="col-span-1 md:col-span-2">
							<span
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2"
							>
								Tipo de Inspeção
							</span>
							<div class="grid grid-cols-2 gap-3 max-w-md">
								<button
									type="button"
									onclick={() => (inspectionType = "Entrega")}
									class="py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer border text-center flex items-center justify-center gap-2 {inspectionType ===
									'Entrega'
										? 'bg-blue-600 text-white border-transparent shadow-lg shadow-blue-500/20 scale-[1.02]'
										: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
								>
									🔑 Entrega
								</button>
								<button
									type="button"
									onclick={() =>
										(inspectionType = "Retirada")}
									class="py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer border text-center flex items-center justify-center gap-2 {inspectionType ===
									'Retirada'
										? 'bg-blue-600 text-white border-transparent shadow-lg shadow-blue-500/20 scale-[1.02]'
										: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
								>
									🚗 Retirada
								</button>
							</div>
						</div>

						<div>
							<label
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
								for="inp-plate"
							>
								Placa do Veículo *
							</label>
							<input
								id="inp-plate"
								type="text"
								bind:value={licensePlate}
								placeholder="ex: XYZ-1234"
								class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 outline-none uppercase font-bold tracking-wider transition-all placeholder:normal-case placeholder:font-normal placeholder:tracking-normal text-sm"
							/>
						</div>

						<div>
							<label
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
								for="inp-datetime"
							>
								Data & Hora
							</label>
							<input
								id="inp-datetime"
								type="datetime-local"
								bind:value={inspectionDateTime}
								class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 outline-none transition-all text-sm font-semibold"
							/>
						</div>

						<div>
							<label
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
								for="inp-inspector"
							>
								Nome do Inspetor
							</label>
							<input
								id="inp-inspector"
								type="text"
								bind:value={inspectorName}
								placeholder="ex: Inspetor Carlos"
								class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 outline-none transition-all text-sm"
							/>
						</div>

						<div>
							<label
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5"
								for="inp-client"
							>
								Nome do Cliente / Proprietário *
							</label>
							<input
								id="inp-client"
								type="text"
								bind:value={clientName}
								placeholder="ex: João Silva"
								class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-200 outline-none transition-all text-sm"
							/>
						</div>
					</div>

					<div
						class="flex justify-end pt-4 border-t border-slate-100 dark:border-slate-800/80"
					>
						<button
							onclick={async () => {
								const saved = await saveDraft();
								if (saved) {
									currentStep = 2;
								}
							}}
							class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/10 cursor-pointer text-sm"
						>
							Avançar: Interior
						</button>
					</div>
				</div>
			{/if}

			<!-- STEP 2: INTERIOR CABIN -->
			{#if currentStep === 2}
				<div
					class="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl animate-fade-in"
				>
					<div
						class="border-b border-slate-100 dark:border-slate-800 pb-4"
					>
						<h3
							class="text-lg font-bold text-slate-800 dark:text-slate-200"
						>
							Status do Interior
						</h3>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- Mileage Input -->
						<div class="space-y-2">
							<label
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300"
								for="inp-mileage"
							>
								Quilometragem *
							</label>
							<div class="relative">
								<div
									class="absolute inset-y-0 inset-s-0 flex items-center ps-3.5 pointer-events-none text-slate-400"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4.5 w-4.5"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<circle
											cx="12"
											cy="12"
											r="9"
											stroke="currentColor"
											stroke-width="2"
										/>
										<path
											d="M12 7v5l3 3"
											stroke="currentColor"
											stroke-width="2"
											stroke-linecap="round"
										/>
									</svg>
								</div>
								<input
									id="inp-mileage"
									type="text"
									bind:value={mileage}
									placeholder="ex: 45.000"
									class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl ps-10 pe-4 py-3 text-slate-900 dark:text-slate-200 outline-none font-bold transition-all text-sm"
								/>
							</div>
						</div>

						<!-- Fuel Level segmented buttons -->
						<div class="col-span-1 md:col-span-2 space-y-2">
							<span
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300"
							>
								Nível de Combustível
							</span>
							<div
								class="bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4"
							>
								<div
									class="grid grid-cols-3 sm:grid-cols-9 gap-2"
								>
									{#each ["0/8", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8"] as level}
										<button
											type="button"
											onclick={() => (fuelLevel = level)}
											class="py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border text-center {fuelLevel ===
											level
												? 'bg-blue-600 text-white border-transparent shadow-md shadow-blue-500/20'
												: 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}"
										>
											<span class="inline sm:hidden">
												{level === "0/8"
													? "Vazio"
													: level === "8/8"
														? "Cheio"
														: level === "4/8"
															? "Meio"
															: level}
											</span>
											<span class="hidden sm:inline">
												{level === "0/8"
													? "Vazio (0/8)"
													: level === "8/8"
														? "Cheio (8/8)"
														: level === "4/8"
															? "Meio (4/8)"
															: level}
											</span>
										</button>
									{/each}
								</div>
							</div>
						</div>

						<!-- Cabin Items present switches -->
						<div class="col-span-1 md:col-span-2 space-y-3">
							<span
								class="block text-sm font-semibold text-slate-700 dark:text-slate-300"
							>
								Itens Presentes na Cabine
							</span>
							<div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
								<!-- Document Switch -->
								<button
									type="button"
									onclick={() => (hasDocument = !hasDocument)}
									class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasDocument
										? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-sm shadow-blue-500/5'
										: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'}"
								>
									<div class="flex items-center gap-3">
										<span class="text-xl">📄</span>
										<div>
											<span
												class="block text-xs font-bold text-slate-800 dark:text-slate-200"
											>
												Documento do Veículo
											</span>
											<span
												class="text-[10px] text-slate-400 dark:text-slate-500 font-medium"
												>CRLV / Seguro</span
											>
										</div>
									</div>
									<div
										class="relative inline-flex items-center pointer-events-none"
									>
										<input
											type="checkbox"
											checked={hasDocument}
											class="sr-only peer"
										/>
										<div
											class="w-9 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"
										></div>
									</div>
								</button>

								<!-- Child Seat Switch -->
								<button
									type="button"
									onclick={() =>
										(hasChildSeat = !hasChildSeat)}
									class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasChildSeat
										? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-sm shadow-blue-500/5'
										: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'}"
								>
									<div class="flex items-center gap-3">
										<span class="text-xl">👶</span>
										<div>
											<span
												class="block text-xs font-bold text-slate-800 dark:text-slate-200"
											>
												Cadeirinha de Bebê
											</span>
											<span
												class="text-[10px] text-slate-400 dark:text-slate-500 font-medium"
												>Assento de segurança instalado</span
											>
										</div>
									</div>
									<div
										class="relative inline-flex items-center pointer-events-none"
									>
										<input
											type="checkbox"
											checked={hasChildSeat}
											class="sr-only peer"
										/>
										<div
											class="w-9 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"
										></div>
									</div>
								</button>

								<!-- E-Toll Tag Switch -->
								<button
									type="button"
									onclick={() => (hasEToll = !hasEToll)}
									class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasEToll
										? 'border-blue-500 bg-blue-500/5 dark:bg-blue-500/10 shadow-sm shadow-blue-500/5'
										: 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 hover:bg-slate-50 dark:hover:bg-slate-800/40'}"
								>
									<div class="flex items-center gap-3">
										<span class="text-xl">🏷️</span>
										<div>
											<span
												class="block text-xs font-bold text-slate-800 dark:text-slate-200"
											>
												Tag de Pedágio
											</span>
											<span
												class="text-[10px] text-slate-400 dark:text-slate-500 font-medium"
												>Dispositivo transponder</span
											>
										</div>
									</div>
									<div
										class="relative inline-flex items-center pointer-events-none"
									>
										<input
											type="checkbox"
											checked={hasEToll}
											class="sr-only peer"
										/>
										<div
											class="w-9 h-5 bg-slate-200 dark:bg-slate-800 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"
										></div>
									</div>
								</button>
							</div>
						</div>
					</div>

					<div
						class="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800/80"
					>
						<button
							onclick={async () => {
								await saveCurrentDraftState();
								currentStep = 1;
							}}
							class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200 dark:border-transparent"
						>
							Voltar: Detalhes
						</button>

						<button
							onclick={async () => {
								if (!mileage) {
									alert(
										"Por favor, insira a quilometragem do veículo.",
									);
									return;
								}
								await saveCurrentDraftState();
								currentStep = 3;
							}}
							class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/10 cursor-pointer text-sm border border-transparent"
						>
							Avançar: Laudo de Danos
						</button>
					</div>
				</div>
			{/if}

			<!-- STEP 3: DAMAGE MAP -->
			{#if currentStep === 3}
				<div
					class="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-2xl sm:rounded-3xl p-3 sm:p-8 space-y-4 sm:space-y-6 backdrop-blur-xl animate-fade-in"
				>
					<div
						class="border-b border-slate-100 dark:border-slate-800 pb-4"
					>
						<h3
							class="text-lg font-bold text-slate-800 dark:text-slate-200"
						>
							Danos
						</h3>
					</div>

					<!-- Insert the visual interactive diagram -->
					<CarDiagram bind:activePart={activePartId} {partStates} />

					<div
						class="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800/80"
					>
						<button
							onclick={async () => {
								await saveCurrentDraftState();
								currentStep = 2;
							}}
							class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-850 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200 dark:border-transparent"
						>
							Voltar: Interior
						</button>

						<button
							onclick={async () => {
								await saveCurrentDraftState();
								currentStep = 4;
							}}
							class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/10 cursor-pointer text-sm border border-transparent"
						>
							Avançar: Conclusão
						</button>
					</div>
				</div>
			{/if}

			<!-- STEP 4: CLIENT SIGN-OFF -->
			{#if currentStep === 4}
				<div
					class="bg-white dark:bg-slate-900/40 border border-slate-200/80 dark:border-slate-800/60 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl"
				>
					<div
						class="border-b border-slate-100 dark:border-slate-800 pb-4"
					>
						<h3
							class="text-lg font-bold text-slate-800 dark:text-slate-200"
						>
							Assinatura do Cliente
						</h3>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<!-- Left Summary info column -->
						<div
							class="space-y-4 bg-slate-50 dark:bg-slate-950/50 border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-4"
						>
							<h4
								class="text-sm font-bold text-slate-800 dark:text-slate-300 uppercase tracking-wide border-b border-slate-200 dark:border-slate-800 pb-2"
							>
								Resumo da Inspeção
							</h4>

							<div class="space-y-3 text-sm">
								<div class="flex justify-between">
									<span class="text-slate-500">Placa:</span>
									<span
										class="font-bold text-slate-900 dark:text-white uppercase"
										>{licensePlate || "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500">Tipo:</span>
									<span
										class="font-semibold text-slate-900 dark:text-white"
										>{inspectionType}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500">Cliente:</span>
									<span
										class="font-semibold text-slate-900 dark:text-white"
										>{clientName || "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500">Inspetor:</span
									>
									<span
										class="text-slate-800 dark:text-slate-300"
										>{inspectorName || "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500"
										>Data/Hora:</span
									>
									<span
										class="text-slate-800 dark:text-slate-300"
										>{formatDateTime(inspectionDateTime)}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500"
										>Quilometragem:</span
									>
									<span
										class="font-semibold text-slate-800 dark:text-slate-200"
										>{mileage
											? mileage + " km"
											: "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500"
										>Combustível:</span
									>
									<span
										class="font-semibold text-slate-800 dark:text-slate-200"
										>{fuelLevel || "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500"
										>Itens da Cabine:</span
									>
									<span
										class="text-xs text-slate-755 text-right font-medium dark:text-slate-300"
									>
										{[
											hasDocument ? "Documento" : null,
											hasChildSeat ? "Cadeirinha" : null,
											hasEToll ? "Tag de Pedágio" : null,
										]
											.filter(Boolean)
											.join(", ") || "Nenhum"}
									</span>
								</div>
								<div
									class="flex justify-between border-t border-slate-200 dark:border-slate-800/50 pt-2"
								>
									<span class="text-slate-500"
										>Danos Registrados:</span
									>
									<span
										class="font-black text-amber-600 dark:text-amber-400"
									>
										{countDamages(partStates)} partes marcadas
									</span>
								</div>
							</div>

							<!-- Mini summary list of damages -->
							<div
								class="space-y-2 mt-4 text-xs max-h-40 overflow-y-auto"
							>
								{#each Object.keys(partStates) as partKey}
									{#if partStates[partKey].status !== "none"}
										<div
											class="flex justify-between items-center bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200/60 dark:border-slate-800/50"
										>
											<span
												class="font-bold text-slate-700 dark:text-slate-300"
												>{partNames[partKey] ||
													partKey}</span
											>
											<div
												class="flex gap-2 items-center"
											>
												<span
													class="px-2 py-0.5 text-[9px] font-black uppercase rounded bg-slate-50 dark:bg-slate-800 border text-amber-600 dark:text-amber-400 border-amber-400/50 dark:border-amber-500"
												>
													{statusLabels[
														partStates[partKey]
															.status
													] ||
														partStates[partKey]
															.status}
												</span>
												{#if partStates[partKey].photos?.length > 0}
													<span
														class="text-slate-500 dark:text-slate-400 font-bold"
														>📸 {partStates[partKey]
															.photos
															.length}</span
													>
												{/if}
											</div>
										</div>
									{/if}
								{/each}
							</div>
						</div>

						<!-- Right Column: ID Upload & Signature capture -->
						<div class="flex flex-col gap-6">
							<!-- Driver's License photo upload -->
							<div class="flex flex-col">
								<div
									class="flex justify-between items-center mb-1.5"
								>
									<label
										class="block text-sm font-semibold text-slate-700 dark:text-slate-300"
										for="inp-license-upload"
									>
										Foto da CNH (Motorista)
									</label>
									<button
										type="button"
										onclick={generateMockLicensePhoto}
										class="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[10px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 rounded font-bold transition-all cursor-pointer border border-slate-200 dark:border-transparent"
									>
										⚡ Gerar CNH Simulada
									</button>
								</div>

								<div
									class="min-h-[160px] bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center p-3"
								>
									{#if clientLicensePhoto}
										<img
											src={clientLicensePhoto}
											alt="CNH do Cliente"
											class="w-full h-32 object-contain rounded-xl"
										/>

										<button
											onclick={() =>
												(clientLicensePhoto = null)}
											class="absolute top-2 right-2 bg-red-600/90 hover:bg-red-600 text-white px-2 py-1 text-xs rounded-lg transition-all"
										>
											Excluir Foto
										</button>
									{:else}
										<label
											class="w-full h-full flex flex-col items-center justify-center cursor-pointer gap-2 py-4"
										>
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-8 w-8 text-slate-400 dark:text-slate-600"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="1.5"
													d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="1.5"
													d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
												/>
											</svg>
											<span
												class="text-xs font-bold text-slate-500 dark:text-slate-400"
												>Clique para Enviar ou Arraste a
												Foto</span
											>
											<span
												class="text-[10px] text-slate-400 dark:text-slate-600"
												>Suporta PNG, JPG ou Câmera do
												Celular</span
											>
											<input
												id="inp-license-upload"
												type="file"
												accept="image/*"
												class="hidden"
												onchange={handleLicensePhotoUpload}
											/>
										</label>
									{/if}
								</div>
							</div>

							<!-- Client Signature -->
							<div class="flex flex-col">
								<label
									for="signature"
									class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2"
								>
									Assinatura de Autorização do Cliente *
								</label>
								<div>
									<SignaturePad
										bind:signature={clientSignature}
									/>
								</div>
							</div>
						</div>
					</div>

					<div
						class="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800/80"
					>
						<button
							onclick={async () => {
								await saveCurrentDraftState();
								currentStep = 3;
							}}
							class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200 dark:border-transparent"
						>
							Voltar: Mapa de Danos
						</button>

						<button
							onclick={submitInspection}
							class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl transition-all shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 cursor-pointer text-sm border border-transparent"
						>
							Concluir & Salvar Inspeção
						</button>
					</div>
				</div>
			{/if}
		</div>
	</main>

	<!-- Footer -->
	<footer
		class="border-t border-slate-200 dark:border-slate-900 py-6 text-center text-xs text-slate-500 dark:text-slate-600 mt-12 print:hidden"
	>
		<p>© 2026 Checklist Alug. Executando localmente no navegador.</p>
	</footer>
</div>

<!-- Active Part Damage Editor Modal -->
{#if activePartId}
	<DamageModal
		bind:partId={activePartId}
		bind:partStates
		partName={partNames[activePartId] || activePartId}
	/>
{/if}
