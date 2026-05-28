<script>
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import {
		getInspection,
		saveInspection,
		deleteInspection as deleteFromDB,
	} from "$lib/db.js";
	import { db } from "$lib/firebase.js";
	import { doc, setDoc, deleteDoc } from "firebase/firestore";
	import logo from "$lib/assets/logo_alug_locadora.png";
	import Navbar from "$lib/components/Navbar.svelte";

	// Retrieve the route param 'id'
	let id = $derived($page.params.id);

	let selectedInspection = $state(null);

	// Lightbox active preview state
	let activePreviewPartKey = $state(null);
	let activePreviewPhotoIndex = $state(null);

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
		try {
			selectedInspection = await getInspection(id);
		} catch (e) {
			console.error("Failed to load inspection from IndexedDB", e);
		}

		// Force light theme
		document.documentElement.classList.remove("dark");
	});

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
		const wasSynced = selectedInspection?.synced;
		try {
			await deleteFromDB(inspectionIdToDelete);
			if (wasSynced) {
				await deleteDoc(doc(db, "checklists", inspectionIdToDelete));
			}
			goto("/dashboard");
		} catch (e) {
			console.error("Failed to delete inspection:", e);
			alert("Falha ao excluir o registro de inspeção.");
		} finally {
			isDeleting = false;
			showDeleteModal = false;
			inspectionIdToDelete = null;
		}
	}

	async function deletePhotoFromInspection(partKey, photoIndex) {
		if (
			selectedInspection &&
			selectedInspection.partStates?.[partKey]?.photos
		) {
			// Filter out the photo
			selectedInspection.partStates[partKey].photos =
				selectedInspection.partStates[partKey].photos.filter(
					(_, idx) => idx !== photoIndex,
				);

			try {
				await saveInspection($state.snapshot(selectedInspection));
				if (selectedInspection.synced && selectedInspection.status === "completed") {
					await setDoc(doc(db, "checklists", selectedInspection.id), $state.snapshot(selectedInspection));
				}
			} catch (e) {
				console.error(
					"Failed to save updated inspection:",
					e,
				);
				alert("Falha ao excluir a foto.");
			}
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

	// Print helper
	function triggerPrint() {
		window.print();
	}
</script>

<svelte:head>
	<title>Detalhes da Inspeção - Checklist Alug</title>
	<meta
		name="description"
		content="Checklist Alug - Veja relatórios de inspeção anteriores com registro digital de danos e assinaturas."
	/>
</svelte:head>

<div
	class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans select-none print:bg-white print:text-black"
>
	<!-- Top Premium Navbar -->
	<Navbar showDashboard={true} />

	<!-- Main Body Wrapper -->
	<main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 print:p-0">
		{#if selectedInspection}
			<!-- DETAILED VIEW OF COMPLETED INSPECTION (WITH PRINT SUPPORT) -->
			<div class="max-w-4xl mx-auto space-y-6">
				<!-- Buttons row (dashboard link, print, delete) -->
				<div class="flex justify-between items-center print:hidden">
					<button
						onclick={() => goto("/dashboard")}
						class="px-5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 text-slate-700 dark:text-slate-300 font-bold rounded-xl text-sm transition-all cursor-pointer"
					>
						← Voltar ao Painel
					</button>

					<div class="flex gap-2">
						<button
							onclick={triggerPrint}
							class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-500/10 cursor-pointer flex items-center gap-1.5"
						>
							PDF
						</button>
						<button
							onclick={() =>
								triggerDelete(selectedInspection.id)}
							class="px-5 py-2.5 bg-red-50 dark:bg-red-950/10 hover:bg-red-600 dark:hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white rounded-xl text-sm border border-red-200 dark:border-red-500/20 hover:border-transparent transition-all cursor-pointer font-bold"
						>
							Excluir
						</button>
					</div>
				</div>

				<!-- Visual Printable Report Card -->
				<div
					class="bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800/80 shadow-xl shadow-slate-200/30 dark:shadow-none rounded-3xl p-6 sm:p-10 backdrop-blur-xl print:bg-white print:border-none print:p-0 print:shadow-none"
				>
					<!-- Header Section -->
					<div
						class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 dark:border-slate-800/80 pb-6 print:border-slate-300"
					>
						<div class="flex items-center gap-3">
							<div
								class="flex items-center justify-center p-1 bg-white rounded-lg border border-slate-150 shadow-xs"
							>
								<img
									src={logo}
									alt="Checklist Alug Logo"
									class="h-10 w-auto object-contain"
								/>
							</div>
							<div>
								<h2
									class="text-xl font-black text-slate-900 dark:text-white print:text-black leading-none"
								>
									Checklist Alug
								</h2>
								<span
									class="text-[10px] text-slate-500 print:text-slate-400 font-bold uppercase tracking-widest"
									>Auditoria Digital de Inspeção</span
								>
							</div>
						</div>

						<div class="mt-4 sm:mt-0 text-left sm:text-right">
							<span
								class="text-xs text-slate-500 font-bold uppercase"
								>ID do Relatório</span
							>
							<p
								class="text-sm font-bold text-slate-900 dark:text-white print:text-black tracking-wider uppercase"
							>
								{selectedInspection.id}
							</p>
						</div>
					</div>

					<!-- Details Grid -->
					<div
						class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-8"
					>
						<div class="space-y-4">
							<h3
								class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1.5 print:border-slate-300"
							>
								Dados da Inspeção
							</h3>

							<div
								class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm"
							>
								<span class="text-slate-500">Placa:</span>
								<span
									class="font-extrabold text-slate-900 dark:text-white print:text-black uppercase tracking-wider"
									>{selectedInspection.licensePlate}</span
								>

								{#if selectedInspection.inspectionType}
									<span class="text-slate-500">Tipo:</span>
									<span
										class="font-extrabold text-slate-900 dark:text-white print:text-black uppercase"
										>{selectedInspection.inspectionType}</span
									>
								{/if}

								<span class="text-slate-500">Inspetor:</span>
								<span
									class="font-semibold text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.inspectorName ||
										"N/A"}</span
								>

								<span class="text-slate-500"
									>Cliente / Proprietário:</span
								>
								<span
									class="font-semibold text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.clientName}</span
								>

								<span class="text-slate-500">Data & Hora:</span>
								<span
									class="text-slate-700 dark:text-slate-300 print:text-black"
									>{new Date(
										selectedInspection.inspectionDateTime,
									).toLocaleString()}</span
								>

								<span class="text-slate-500"
									>Relatório Salvo em:</span
								>
								<span
									class="text-slate-500 dark:text-slate-400 print:text-slate-600"
									>{new Date(
										selectedInspection.createdAt,
									).toLocaleString()}</span
								>
							</div>
						</div>

						<!-- Interior Cabin Status column -->
						<div class="space-y-4">
							<h3
								class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1.5 print:border-slate-300"
							>
								Status da Cabine / Interior
							</h3>

							<div
								class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm"
							>
								<span class="text-slate-500"
									>Quilometragem:</span
								>
								<span
									class="font-semibold text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.mileage
										? selectedInspection.mileage + " km"
										: "N/A"}</span
								>

								<span class="text-slate-500"
									>Nível de Combustível:</span
								>
								<span
									class="font-semibold text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.fuelLevel ||
										"N/A"}</span
								>

								<span class="text-slate-500"
									>Documento do Veículo:</span
								>
								<span
									class="text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.hasDocument
										? "✅ Presente"
										: "❌ Ausente"}</span
								>

								<span class="text-slate-500"
									>Cadeirinha Infantil:</span
								>
								<span
									class="text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.hasChildSeat
										? "✅ Presente"
										: "❌ Ausente"}</span
								>

								<span class="text-slate-500"
									>Tag de Pedágio:</span
								>
								<span
									class="text-slate-800 dark:text-slate-200 print:text-black"
									>{selectedInspection.hasEToll
										? "✅ Presente"
										: "❌ Ausente"}</span
								>
							</div>
						</div>

						<!-- Drivers license picture preview -->
						{#if selectedInspection.clientLicensePhoto}
							<div class="space-y-2">
								<h3
									class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 dark:border-slate-800 pb-1.5 print:border-slate-300"
								>
									Identidade / CNH do Cliente
								</h3>
								<div
									class="h-35 border border-slate-200 dark:border-slate-800/80 rounded-2xl overflow-hidden bg-slate-50 dark:bg-slate-950 p-2 print:bg-white print:border-slate-300"
								>
									<img
										src={selectedInspection.clientLicensePhoto}
										alt="CNH do Cliente"
										class="w-full h-full object-contain"
									/>
								</div>
							</div>
						{/if}
					</div>

					<!-- Damage mapping details list -->
					<div class="my-8 space-y-4">
						<h3
							class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 dark:border-slate-800 pb-1.5 print:border-slate-300"
						>
							Laudo de Mapeamento de Danos
						</h3>

						{#if countDamages(selectedInspection.partStates) === 0}
							<div
								class="p-6 bg-slate-50 dark:bg-slate-900/30 rounded-2xl border border-slate-200 dark:border-slate-800 text-center text-slate-500 print:bg-slate-100 print:border-slate-200"
							>
								Nenhum dano visual ou mecânico foi registrado
								durante esta inspeção.
							</div>
						{:else}
							<div class="space-y-4">
								{#each Object.keys(selectedInspection.partStates) as partKey}
									{#if selectedInspection.partStates[partKey].status !== "none"}
										<div
											class="bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 print:bg-white print:border-slate-300 print:break-inside-avoid"
										>
											<!-- Row: Part Name + Status Tag -->
											<div
												class="flex justify-between items-center"
											>
												<h4
													class="text-base font-bold text-slate-900 dark:text-white print:text-black"
												>
													{partNames[partKey] ||
														partKey}
												</h4>

												<span
													class="px-3 py-1 text-xs font-black uppercase rounded-lg border bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 border-amber-500/40 print:text-amber-600 print:border-amber-400"
												>
													{statusLabels[
														selectedInspection
															.partStates[partKey]
															.status
													] ||
														selectedInspection
															.partStates[partKey]
															.status}
												</span>
											</div>

											<!-- Comments -->
											{#if selectedInspection.partStates[partKey].comments}
												<p
													class="text-sm text-slate-700 dark:text-slate-300 print:text-slate-800 italic bg-white dark:bg-slate-900/30 p-3 rounded-xl border border-slate-200 dark:border-slate-900 print:bg-slate-50 print:border-slate-200"
												>
													"{selectedInspection
														.partStates[partKey]
														.comments}"
												</p>
											{/if}

											<!-- Photos list -->
											{#if selectedInspection.partStates[partKey].photos?.length > 0}
												<div
													class="grid grid-cols-3 sm:grid-cols-5 gap-3"
												>
													{#each selectedInspection.partStates[partKey].photos as photo, idx}
														<button
															type="button"
															onclick={() => {
																activePreviewPartKey =
																	partKey;
																activePreviewPhotoIndex =
																	idx;
															}}
															class="aspect-square bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden print:border-slate-300 cursor-pointer text-left focus:outline-none"
														>
															<img
																src={photo}
																alt="{partKey} {idx}"
																class="w-full h-full object-cover"
															/>
														</button>
													{/each}
												</div>
											{/if}
										</div>
									{/if}
								{/each}
							</div>
						{/if}
					</div>

					<!-- Lightbox Preview Overlay for Inspection Detail Page -->
					{#if activePreviewPartKey !== null && activePreviewPhotoIndex !== null && selectedInspection?.partStates?.[activePreviewPartKey]?.photos?.[activePreviewPhotoIndex]}
						<div
							class="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md transition-opacity duration-300 print:hidden"
							onclick={() => {
								activePreviewPartKey = null;
								activePreviewPhotoIndex = null;
							}}
							role="presentation"
						>
							<div
								class="relative max-w-2xl w-full flex flex-col items-center gap-6"
								onclick={(e) => e.stopPropagation()}
								role="presentation"
							>
								<img
									src={selectedInspection.partStates[
										activePreviewPartKey
									].photos[activePreviewPhotoIndex]}
									alt="Large Preview"
									class="max-h-[70vh] max-w-full object-contain rounded-2xl border border-slate-800 shadow-2xl"
								/>

								<div class="flex gap-4">
									<button
										type="button"
										onclick={() => {
											deletePhotoFromInspection(
												activePreviewPartKey,
												activePreviewPhotoIndex,
											);
											activePreviewPartKey = null;
											activePreviewPhotoIndex = null;
										}}
										class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/30 cursor-pointer text-sm"
									>
										Excluir Foto
									</button>
									<button
										type="button"
										onclick={() => {
											activePreviewPartKey = null;
											activePreviewPhotoIndex = null;
										}}
										class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-700"
									>
										Fechar
									</button>
								</div>
							</div>
						</div>
					{/if}

					<!-- Authorizations / Sign-Off signature -->
					<div
						class="mt-12 pt-8 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 print:border-slate-300 print:mt-8"
					>
						<div class="space-y-1">
							<span
								class="text-xs text-slate-500 font-bold uppercase"
								>Termo de Acordo e Assinatura do Cliente</span
							>
							<p
								class="text-sm text-slate-700 dark:text-slate-300 print:text-slate-800 w-full max-w-sm"
							>
								Pelo presente instrumento, autorizo e concordo
								que os danos mapeados acima refletem o estado
								físico exato do veículo no momento da inspeção.
							</p>
						</div>

						<div class="text-left sm:text-right">
							<span
								class="text-xs text-slate-500 font-bold uppercase"
								>Assinatura do Cliente</span
							>
							<div
								class="h-20 w-48 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl mt-1.5 overflow-hidden flex items-center justify-center p-2 print:bg-white print:border-slate-300"
							>
								{#if selectedInspection.clientSignature}
									<img
										src={selectedInspection.clientSignature}
										alt="Assinatura"
										class="h-full object-contain"
									/>
								{:else}
									<span
										class="text-xs text-slate-400 dark:text-slate-600"
										>Nenhuma assinatura capturada</span
									>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<div class="max-w-md mx-auto text-center py-16 space-y-4">
				<p class="text-slate-500">
					Carregando detalhes da inspeção ou registro não
					encontrado...
				</p>
				<button
					onclick={() => goto("/dashboard")}
					class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-sm cursor-pointer transition-all"
				>
					Retornar ao Painel
				</button>
			</div>
		{/if}
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

<style>
	@media print {
		:global(body) {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
	}
</style>
