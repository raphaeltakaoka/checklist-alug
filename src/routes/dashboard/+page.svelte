<script>
	import { onMount, onDestroy } from "svelte";
	import { goto } from "$app/navigation";
	import {
		getAllInspections,
		deleteInspection as deleteFromDB,
	} from "$lib/db.js";
	import { syncInspectionToCloud } from "$lib/sync.js";
	import { db } from "$lib/firebase.js";
	import { doc, deleteDoc } from "firebase/firestore";
	import Navbar from "$lib/components/Navbar.svelte";

	// App state management
	let inspections = $state([]);
	let inspectorName = $state("Inspetor");

	// Search query for dashboard
	let searchPlate = $state("");

	// Sync and offline states
	let activeSyncIds = $state(new Set());
	let isOffline = $state(false);

	let eventCleanup = () => {};

	onMount(async () => {
		try {
			inspections = await getAllInspections();
		} catch (e) {
			console.error("Failed to load inspections from IndexedDB", e);
		}

		// Retrieve inspector name from localStorage
		inspectorName = localStorage.getItem("inspectorName") || "Inspetor";

		// Force light theme
		document.documentElement.classList.remove("dark");

		// Sync status initialization
		isOffline = !navigator.onLine;

		// Listen to network changes
		const handleOnline = () => {
			isOffline = false;
			triggerPendingSyncs();
		};
		const handleOffline = () => {
			isOffline = true;
		};

		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);

		eventCleanup = () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};

		// Trigger sync immediately on mount for any pending local items
		triggerPendingSyncs();
	});

	onDestroy(() => {
		eventCleanup();
	});

	async function triggerPendingSyncs() {
		if (isOffline) return;

		// Find completed checklists that haven't been synced yet
		const pending = inspections.filter(
			(i) => i.status === "completed" && !i.synced,
		);

		for (const ins of pending) {
			if (activeSyncIds.has(ins.id)) continue;

			// Add to active syncs
			activeSyncIds.add(ins.id);
			activeSyncIds = new Set(activeSyncIds); // trigger reactivity in Svelte 5

			try {
				await syncInspectionToCloud(ins);
				// Refresh local list to pick up updated "synced: true" and lightweight urls
				inspections = await getAllInspections();
			} catch (e) {
				console.error(
					`Failed to sync inspection ${ins.id} to cloud:`,
					e,
				);
			} finally {
				activeSyncIds.delete(ins.id);
				activeSyncIds = new Set(activeSyncIds); // trigger reactivity in Svelte 5
			}
		}
	}

	function startNewInspection() {
		goto("/dashboard/new");
	}

	// Custom delete confirmation modal state
	let showDeleteModal = $state(false);
	let inspectionIdToDelete = $state(null);
	let isDeleting = $state(false);

	function triggerDelete(id) {
		inspectionIdToDelete = id;
		showDeleteModal = true;
	}

	function cancelDelete() {
		showDeleteModal = false;
		inspectionIdToDelete = null;
	}

	async function deleteInspection() {
		if (!inspectionIdToDelete) return;
		isDeleting = true;

		// Check if it was synced
		const toDelete = inspections.find((i) => i.id === inspectionIdToDelete);
		const wasSynced = toDelete?.synced;

		try {
			// Delete locally from IndexedDB
			await deleteFromDB(inspectionIdToDelete);
			inspections = inspections.filter(
				(i) => i.id !== inspectionIdToDelete,
			);

			// Delete from Cloud Firestore if synced
			if (wasSynced) {
				await deleteDoc(doc(db, "checklists", inspectionIdToDelete));
			}
		} catch (e) {
			console.error("Failed to delete inspection:", e);
			alert("Falha ao excluir o registro de inspeção.");
		} finally {
			isDeleting = false;
			showDeleteModal = false;
			inspectionIdToDelete = null;
		}
	}

	// Filter inspections by license plate or client name search
	const filteredInspections = $derived(
		inspections.filter(
			(i) =>
				i.licensePlate
					.toLowerCase()
					.includes(searchPlate.toLowerCase()) ||
				i.clientName.toLowerCase().includes(searchPlate.toLowerCase()),
		),
	);

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
</script>

<svelte:head>
	<title>Checklist Alug</title>
	<meta
		name="description"
		content="Checklist Alug - Suíte premium de inspeção de carros e mapeamento de danos com captura de assinaturas."
	/>
</svelte:head>

<div
	class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans select-none"
>
	<!-- Top Premium Navbar -->
	<Navbar />

	<!-- Main Body Wrapper -->
	<main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
		<!-- DASHBOARD VIEW -->
		<div class="space-y-6">
			<!-- Hero Summary Dashboard -->
			<div
				class="bg-linear-to-tr from-white to-slate-100 dark:from-slate-900 dark:to-indigo-950 border border-slate-200 dark:border-slate-900/60 shadow-xl shadow-slate-200/20 dark:shadow-none rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
			>
				<div>
					<h2
						class="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-tight"
					>
						Bem-vindo, {inspectorName}
					</h2>
					<div class="flex items-center gap-2.5 mt-2">
						{#if isOffline}
							<div
								class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/25 text-xs font-bold animate-pulse"
							>
								<span
									class="w-1.5 h-1.5 rounded-full bg-amber-500"
								></span>
								<span>Modo Offline (Aguardando Internet)</span>
							</div>
						{:else if activeSyncIds.size > 0}
							<div
								class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/25 text-xs font-bold"
							>
								<svg
									class="animate-spin h-3.5 w-3.5 text-blue-650"
									xmlns="http://www.w3.org/2000/svg"
									fill="none"
									viewBox="0 0 24 24"
								>
									<circle
										class="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										stroke-width="4"
									></circle>
									<path
										class="opacity-75"
										fill="currentColor"
										d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
									></path>
								</svg>
								<span
									>Sincronizando {activeSyncIds.size}
									{activeSyncIds.size === 1
										? "relatório"
										: "relatórios"}...</span
								>
							</div>
						{:else if inspections.some((i) => i.status === "completed" && !i.synced)}
							<div
								class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-500/10 text-slate-600 border border-slate-500/25 text-xs font-bold"
							>
								<span
									class="w-1.5 h-1.5 rounded-full bg-slate-400"
								></span>
								<span
									>{inspections.filter(
										(i) =>
											i.status === "completed" &&
											!i.synced,
									).length} na fila de envio</span
								>
							</div>
						{:else}
							<div
								class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/25 text-xs font-bold"
							>
								<span
									class="w-1.5 h-1.5 rounded-full bg-emerald-500"
								></span>
								<span>Nuvem Sincronizada</span>
							</div>
						{/if}
					</div>
				</div>

				<button
					onclick={startNewInspection}
					class="w-full md:w-auto px-6 py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-2xl transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 flex items-center justify-center gap-2 cursor-pointer text-sm"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2.5"
							d="M12 4v16m8-8H4"
						/>
					</svg>
					Iniciar Nova Inspeção
				</button>
			</div>

			<!-- Search & Inspections List -->
			<div class="space-y-4">
				<div
					class="flex flex-col sm:flex-row gap-4 items-center justify-between"
				>
					<div>
						<h3
							class="text-lg font-bold text-slate-800 dark:text-slate-200"
						>
							Relatórios Anteriores
						</h3>
						<p class="text-xs text-slate-500">
							Salvo localmente neste dispositivo.
						</p>
					</div>

					<!-- Search bar -->
					<div class="w-full sm:max-w-xs relative">
						<input
							type="text"
							bind:value={searchPlate}
							placeholder="Buscar por placa ou cliente..."
							class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:border-blue-500 dark:focus:border-blue-500 rounded-xl pl-10 pr-4 py-2.5 text-slate-800 dark:text-slate-200 outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-slate-600 text-sm"
						/>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4.5 w-4.5 text-slate-400 dark:text-slate-600 absolute left-3 top-3.5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
							/>
						</svg>
					</div>
				</div>

				{#if filteredInspections.length === 0}
					<!-- Empty dashboard state -->
					<div
						class="p-12 border border-dashed border-slate-300 dark:border-slate-900 bg-white dark:bg-slate-900/10 rounded-3xl text-center space-y-4"
					>
						<div
							class="w-12 h-12 bg-slate-100 dark:bg-slate-900 rounded-2xl flex items-center justify-center mx-auto text-slate-400 dark:text-slate-600"
						>
							📄
						</div>
						<div class="space-y-1">
							<h4
								class="text-base font-bold text-slate-800 dark:text-slate-300"
							>
								Nenhuma inspeção encontrada
							</h4>
							<p class="text-xs text-slate-500 max-w-xs mx-auto">
								{searchPlate
									? "Nenhum resultado corresponde ao filtro de busca."
									: "Clique em 'Iniciar Nova Inspeção' para registrar seu primeiro relatório de vistoria."}
							</p>
						</div>
					</div>
				{:else}
					<!-- Inspections list grid -->
					<div
						class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
					>
						{#each filteredInspections as rep}
							<div
								class="bg-white hover:bg-slate-50/50 dark:bg-slate-900/30 dark:hover:bg-slate-900/60 border border-slate-200 dark:border-slate-900 hover:border-slate-300 dark:hover:border-slate-800 shadow-sm hover:shadow-md dark:shadow-none rounded-2xl p-5 transition-all flex flex-col justify-between group relative overflow-hidden"
							>
								<!-- License plate display -->
								<div class="flex justify-between items-start">
									<div>
										<span
											class="text-[10px] text-blue-600 dark:text-blue-500 uppercase tracking-widest font-extrabold"
											>Placa do Veículo</span
										>
										<h4
											class="text-xl font-black text-slate-900 dark:text-white uppercase tracking-wider mt-0.5"
										>
											{rep.licensePlate}
										</h4>
									</div>

									<!-- Visual badges showing type and damages -->
									<div
										class="flex flex-col items-end gap-1.5"
									>
										{#if rep.status === "draft"}
											<span
												class="px-2 py-0.5 text-[9px] font-black uppercase rounded border bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 border-amber-200 dark:border-amber-800/50"
											>
												📝 Rascunho
											</span>
										{:else}
											<span
												class="px-2 py-0.5 text-[9px] font-black uppercase rounded border bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50"
											>
												✅ Concluído
											</span>

											<!-- Cloud Sync status badge -->
											{#if rep.synced}
												<span
													class="px-2 py-0.5 text-[9px] uppercase rounded border bg-blue-50 dark:bg-blue-950/20 text-blue-650 dark:text-blue-400 border-blue-200 dark:border-blue-805/50 flex items-center gap-1 font-extrabold"
												>
													☁️ Sincronizado
												</span>
											{:else if activeSyncIds.has(rep.id)}
												<span
													class="px-2 py-0.5 text-[9px] uppercase rounded border bg-blue-500/10 text-blue-600 border-blue-500/20 flex items-center gap-1 animate-pulse font-extrabold"
												>
													<svg
														class="animate-spin h-2 w-2 text-blue-600"
														xmlns="http://www.w3.org/2000/svg"
														fill="none"
														viewBox="0 0 24 24"
													>
														<circle
															class="opacity-25"
															cx="12"
															cy="12"
															r="10"
															stroke="currentColor"
															stroke-width="4"
														></circle>
														<path
															class="opacity-75"
															fill="currentColor"
															d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
														></path>
													</svg>
													Enviando...
												</span>
											{:else if isOffline}
												<span
													class="px-2 py-0.5 text-[9px] uppercase rounded border bg-amber-500/10 text-amber-600 border-amber-500/20 flex items-center gap-1 font-extrabold"
												>
													🕒 Fila (Offline)
												</span>
											{:else}
												<span
													class="px-2 py-0.5 text-[9px] font-black uppercase rounded border bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700 flex items-center gap-1"
												>
													🕒 Na Fila
												</span>
											{/if}
										{/if}
										{#if rep.inspectionType}
											<span
												class="px-2 py-0.5 text-[9px] font-black uppercase rounded border {rep.inspectionType ===
												'Entrega'
													? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800/50'
													: 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50'}"
											>
												{rep.inspectionType ===
												"Entrega"
													? "🔑 Entrega"
													: "🚗 Retirada"}
											</span>
										{/if}
										<span
											class="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-amber-600 dark:text-amber-400"
										>
											{countDamages(rep.partStates)} Danos
										</span>
									</div>
								</div>

								<!-- Client and date details -->
								<div
									class="my-5 space-y-2 text-xs border-t border-slate-100 dark:border-slate-900 pt-4"
								>
									<div class="flex justify-between">
										<span
											class="text-slate-500 dark:text-slate-600"
											>Cliente:</span
										>
										<span
											class="font-semibold text-slate-700 dark:text-slate-300"
											>{rep.clientName}</span
										>
									</div>
									<div class="flex justify-between">
										<span
											class="text-slate-500 dark:text-slate-600"
											>Inspetor:</span
										>
										<span
											class="text-slate-600 dark:text-slate-400"
											>{rep.inspectorName || "N/A"}</span
										>
									</div>
									<div class="flex justify-between">
										<span
											class="text-slate-500 dark:text-slate-600"
											>Data:</span
										>
										<span
											class="text-slate-600 dark:text-slate-400"
											>{(() => {
												const d = new Date(
													rep.inspectionDateTime,
												);
												const dateStr =
													d.toLocaleDateString(
														"pt-BR",
													);
												const timeStr =
													d.toLocaleTimeString(
														"pt-BR",
														{
															hour: "2-digit",
															minute: "2-digit",
														},
													);
												return `${dateStr} às ${timeStr}`;
											})()}</span
										>
									</div>
								</div>

								<!-- Actions -->
								<div class="flex gap-2">
									{#if rep.status === "draft"}
										<button
											onclick={() =>
												goto(
													"/dashboard/new?id=" +
														rep.id,
												)}
											class="flex-1 py-2 text-center text-xs font-black text-white bg-amber-600 hover:bg-amber-500 rounded-xl transition-all cursor-pointer shadow-md shadow-amber-600/10 hover:shadow-amber-600/20"
										>
											Continuar Inspeção
										</button>
									{:else}
										<button
											onclick={() =>
												goto(
													"/dashboard/new/" + rep.id,
												)}
											class="flex-1 py-2 text-center text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl transition-all cursor-pointer"
										>
											Ver / Imprimir Detalhes
										</button>
									{/if}
									<button
										onclick={(e) => {
											e.preventDefault();
											e.stopPropagation();
											triggerDelete(rep.id);
										}}
										class="px-3 py-2 bg-slate-50 hover:bg-red-50 dark:bg-slate-950 dark:hover:bg-red-950/20 text-slate-500 dark:text-slate-600 hover:text-red-600 dark:hover:text-red-400 border border-slate-200 dark:border-slate-900 rounded-xl transition-all cursor-pointer text-xs"
										title="Excluir inspeção"
									>
										✕
									</button>
								</div>

								<!-- Ambient hover background gradient -->
								<div
									class="absolute inset-0 rounded-2xl bg-linear-to-tr from-blue-500/2 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
								></div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</main>

	<!-- Footer -->
	<footer
		class="border-t border-slate-200 dark:border-slate-900 py-6 text-center text-xs text-slate-500 dark:text-slate-600 mt-12 print:hidden"
	>
		<p>© 2026 Checklist Alug. Executando localmente no navegador.</p>
	</footer>
</div>

{#if showDeleteModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md transition-all duration-300"
	>
		<div
			class="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl rounded-3xl p-6 space-y-6 transform scale-100 transition-all"
		>
			<div class="text-center space-y-3">
				<div
					class="w-12 h-12 bg-red-50 dark:bg-red-950/20 rounded-2xl flex items-center justify-center mx-auto text-red-500 text-xl font-bold"
				>
					⚠️
				</div>
				<h3
					class="text-lg font-bold text-slate-800 dark:text-slate-200"
				>
					Excluir Inspeção
				</h3>
				<p class="text-xs text-slate-500 max-w-xs mx-auto">
					Tem certeza de que deseja excluir este registro de inspeção?
					Esta ação é irreversível.
				</p>
			</div>
			<div class="flex gap-3">
				<button
					onclick={cancelDelete}
					class="flex-1 py-3 text-center text-xs font-bold text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-transparent"
					disabled={isDeleting}
				>
					Cancelar
				</button>
				<button
					onclick={deleteInspection}
					class="flex-1 py-3 text-center text-xs font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition-all shadow-md shadow-red-600/10 cursor-pointer"
					disabled={isDeleting}
				>
					{isDeleting ? "Excluindo..." : "Excluir"}
				</button>
			</div>
		</div>
	</div>
{/if}
