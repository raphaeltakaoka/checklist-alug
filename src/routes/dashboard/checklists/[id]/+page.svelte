<script>
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { db } from "$lib/firebase.js";
	import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
	import { deleteInspection as deleteFromDB, saveInspection as saveToDB } from "$lib/db.js";
	import logo from "$lib/assets/logo_alug_locadora.png";
	import Navbar from "$lib/components/Navbar.svelte";

	// Retrieve route params reactively
	let id = $derived($page.params.id);

	let selectedInspection = $state(null);
	let loading = $state(true);

	// Lightbox active preview state
	let activePreviewPartKey = $state(null);
	let activePreviewPhotoIndex = $state(null);

	// Custom delete confirmation modal state
	let showDeleteModal = $state(false);
	let inspectionIdToDelete = $state(null);
	let isDeleting = $state(false);

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
		damaged: "Danificado",
	};

	const statusBadgeStyles = {
		scratch: "text-amber-600  border-amber-500/40 bg-white  print:text-amber-600 print:border-amber-400",
		dent: "text-orange-600  border-orange-500/40 bg-white  print:text-orange-600 print:border-orange-400",
		crack: "text-purple-600  border-purple-500/40 bg-white  print:text-purple-600 print:border-purple-400",
		broken: "text-red-600  border-red-500/40 bg-white  print:text-red-600 print:border-red-400",
		damaged: "text-indigo-600  border-indigo-500/40 bg-white  print:text-indigo-600 print:border-indigo-400",
	};

	// Fetch Firestore document reactively when route changes
	$effect(() => {
		if (id) {
			fetchChecklist(id);
		}
	});

	async function fetchChecklist(docId) {
		loading = true;
		try {
			const docRef = doc(db, "checklists", docId);
			const docSnap = await getDoc(docRef);
			if (docSnap.exists()) {
				selectedInspection = docSnap.data();
			} else {
				console.error("Checklist not found in Firestore");
				selectedInspection = null;
			}
		} catch (e) {
			console.error("Failed to load checklist from Firestore:", e);
			selectedInspection = null;
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		// Force light theme
		document.documentElement.classList.remove("dark");
	});

	function triggerDelete(targetId) {
		inspectionIdToDelete = targetId;
		showDeleteModal = true;
	}

	function cancelDelete() {
		showDeleteModal = false;
		inspectionIdToDelete = null;
	}

	async function deleteInspection() {
		if (!inspectionIdToDelete) return;
		isDeleting = true;
		try {
			// Delete locally from IndexedDB if exists
			try {
				await deleteFromDB(inspectionIdToDelete);
			} catch (e) {
				console.warn("Could not delete from local IndexedDB:", e);
			}

			// Delete from Cloud Firestore
			await deleteDoc(doc(db, "checklists", inspectionIdToDelete));
			goto("/dashboard/checklists");
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
				// Save in Cloud Firestore
				await setDoc(doc(db, "checklists", selectedInspection.id), $state.snapshot(selectedInspection));
				
				// Also update local IndexedDB if cached
				try {
					await saveToDB($state.snapshot(selectedInspection));
				} catch (e) {
					console.warn("Could not save to local IndexedDB:", e);
				}
			} catch (e) {
				console.error("Failed to delete photo from Firestore checklist:", e);
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

	function triggerPrint() {
		window.print();
	}
</script>

<svelte:head>
	<title>Laudo de Inspeção na Nuvem - Checklist Alug</title>
	<meta
		name="description"
		content="Checklist Alug - Relatório detalhado de vistoria sincronizado em Cloud Firestore."
	/>
</svelte:head>

<div
	class="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none print:bg-white print:text-black"
>
	<!-- Top Premium Navbar -->
	<Navbar showDashboard={true} />

	<!-- Main Body Wrapper -->
	<main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 print:p-0">
		{#if loading}
			<!-- Premium Glow Spinner Loading State -->
			<div class="max-w-md mx-auto text-center py-24 space-y-4">
				<div class="relative w-14 h-14 flex items-center justify-center mx-auto">
					<div class="absolute inset-0 rounded-full border-4 border-slate-100"></div>
					<div class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
				</div>
				<p class="text-xs text-slate-500 font-bold tracking-widest uppercase">
					Buscando laudo da nuvem...
				</p>
			</div>
		{:else if selectedInspection}
			<!-- DETAILED VIEW OF COMPLETED INSPECTION (WITH PRINT SUPPORT) -->
			<div class="max-w-4xl mx-auto space-y-6">
				<!-- Buttons row (checklists index link, print, delete) -->
				<div class="flex justify-between items-center print:hidden">
					<button
						onclick={() => goto("/dashboard/checklists")}
						class="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 :bg-slate-850 text-slate-700 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-xs"
					>
						← Voltar aos Checklists
					</button>

					<div class="flex gap-2">
						<button
							onclick={triggerPrint}
							class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl text-sm transition-all shadow-sm hover:shadow-md cursor-pointer flex items-center gap-1.5"
						>
							PDF / Imprimir
						</button>
						<button
							onclick={() => triggerDelete(selectedInspection.id)}
							class="px-5 py-2.5 bg-red-50 hover:bg-red-600 :bg-red-650 text-red-600 hover:text-white rounded-xl text-sm border border-red-205 hover:border-transparent transition-all cursor-pointer font-bold"
						>
							Excluir
						</button>
					</div>
				</div>

				<!-- Visual Printable Report Card -->
				<div
					class="bg-white border border-slate-200 shadow-md rounded-3xl p-6 sm:p-10 backdrop-blur-xl print:bg-white print:border-none print:p-0 print:shadow-none"
				>
					<!-- Header Section -->
					<div
						class="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-slate-100 pb-6 print:border-slate-300"
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
									class="text-xl font-black text-slate-900 print:text-black leading-none"
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
							<span class="text-xs text-slate-500 font-bold uppercase"
								>ID do Relatório</span
							>
							<p
								class="text-sm font-bold text-slate-900 print:text-black tracking-wider uppercase"
							>
								{selectedInspection.id}
							</p>
						</div>
					</div>

					<!-- Details Grid -->
					<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-8">
						<div class="space-y-4">
							<h3
								class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1.5 print:border-slate-300"
							>
								Dados da Inspeção
							</h3>

							<div class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
								<span class="text-slate-500">Placa:</span>
								<span
									class="font-extrabold text-slate-900 print:text-black uppercase tracking-wider"
									>{selectedInspection.licensePlate}</span
								>

								{#if selectedInspection.inspectionType}
									<span class="text-slate-500">Tipo:</span>
									<span
										class="font-extrabold text-slate-900 print:text-black uppercase"
										>{selectedInspection.inspectionType}</span
									>
								{/if}

								<span class="text-slate-500">Inspetor:</span>
								<span
									class="font-semibold text-slate-800 print:text-black"
									>{selectedInspection.inspectorName || "N/A"}</span
								>

								<span class="text-slate-500">Cliente / Proprietário:</span>
								<span
									class="font-semibold text-slate-800 print:text-black"
									>{selectedInspection.clientName}</span
								>

								<span class="text-slate-500">Data & Hora:</span>
								<span class="text-slate-700 print:text-black"
									>{new Date(
										selectedInspection.inspectionDateTime,
									).toLocaleString()}</span
								>

								<span class="text-slate-500">Relatório Salvo em:</span>
								<span
									class="text-slate-500 print:text-slate-600"
									>{new Date(selectedInspection.createdAt).toLocaleString()}</span
								>
							</div>
						</div>

						<!-- Interior Cabin Status column -->
						<div class="space-y-4">
							<h3
								class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1.5 print:border-slate-300"
							>
								Status da Cabine / Interior
							</h3>

							<div class="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
								<span class="text-slate-500">Quilometragem:</span>
								<span
									class="font-semibold text-slate-800 print:text-black"
									>{selectedInspection.mileage
										? selectedInspection.mileage + " km"
										: "N/A"}</span
								>

								<span class="text-slate-500">Nível de Combustível:</span>
								<span
									class="font-semibold text-slate-800 print:text-black"
									>{selectedInspection.fuelLevel || "N/A"}</span
								>

								<span class="text-slate-500">Documento do Veículo:</span>
								<span class="text-slate-800 print:text-black"
									>{selectedInspection.hasDocument
										? "✅ Presente"
										: "❌ Ausente"}</span
								>

								<span class="text-slate-500">Cadeirinha Infantil:</span>
								<span class="text-slate-800 print:text-black"
									>{selectedInspection.hasChildSeat
										? "✅ Presente"
										: "❌ Ausente"}</span
								>

								<span class="text-slate-500">Tag de Pedágio:</span>
								<span class="text-slate-800 print:text-black"
									>{selectedInspection.hasEToll ? "✅ Presente" : "❌ Ausente"}</span
								>
							</div>
						</div>

						<!-- Drivers license picture preview -->
						{#if selectedInspection.clientLicensePhoto}
							<div class="space-y-2">
								<h3
									class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1.5 print:border-slate-300"
								>
									Identidade / CNH do Cliente
								</h3>
								<div
									class="h-35 border border-slate-200 rounded-2xl overflow-hidden bg-slate-50 p-2 print:bg-white print:border-slate-300"
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
							class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 print:border-slate-300"
						>
							Laudo de Mapeamento de Danos
						</h3>

						{#if countDamages(selectedInspection.partStates) === 0}
							<div
								class="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500 print:bg-slate-100 print:border-slate-200"
							>
								Nenhum dano visual ou mecânico foi registrado durante esta inspeção.
							</div>
						{:else}
							<div class="space-y-4">
								{#each Object.keys(selectedInspection.partStates) as partKey (partKey)}
									{#if selectedInspection.partStates[partKey].status !== "none"}
										<div
											class="bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col gap-4 print:bg-white print:border-slate-300 print:break-inside-avoid"
										>
											<!-- Row: Part Name + Status Tag -->
											<div class="flex justify-between items-center">
												<h4
													class="text-base font-bold text-slate-900 print:text-black"
												>
													{partNames[partKey] || partKey}
												</h4>

												<span
													class="px-3 py-1 text-xs font-black uppercase rounded-lg border {statusBadgeStyles[ selectedInspection.partStates[partKey].status ] || 'bg-white border-slate-200 text-slate-650 print:text-slate-650 print:border-slate-400'}"
												>
													{statusLabels[
														selectedInspection.partStates[partKey].status
													] || selectedInspection.partStates[partKey].status}
												</span>
											</div>

											<!-- Comments -->
											{#if selectedInspection.partStates[partKey].comments}
												<p
													class="text-sm text-slate-700 print:text-slate-800 italic bg-white p-3 rounded-xl border border-slate-200 print:bg-slate-50 print:border-slate-200"
												>
													"{selectedInspection.partStates[partKey].comments}"
												</p>
											{/if}

											<!-- Photos list -->
											{#if selectedInspection.partStates[partKey].photos?.length > 0}
												<div class="grid grid-cols-3 sm:grid-cols-5 gap-3">
													{#each selectedInspection.partStates[partKey].photos as photo, idx (photo)}
														<button
															type="button"
															onclick={() => {
																activePreviewPartKey = partKey;
																activePreviewPhotoIndex = idx;
															}}
															class="aspect-square bg-white border border-slate-200 rounded-xl overflow-hidden print:border-slate-300 cursor-pointer text-left focus:outline-none"
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

					<!-- Authorizations / Sign-Off signature -->
					<div
						class="mt-12 pt-8 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-8 print:border-slate-300 print:mt-8"
					>
						<div class="space-y-1">
							<span class="text-xs text-slate-500 font-bold uppercase"
								>Termo de Acordo e Assinatura do Cliente</span
							>
							<p
								class="text-sm text-slate-700 print:text-slate-800 w-full max-w-sm"
							>
								Pelo presente instrumento, autorizo e concordo que os danos mapeados
								acima refletem o estado físico exato do veículo no momento da
								inspeção.
							</p>
						</div>

						<div class="text-left sm:text-right">
							<span class="text-xs text-slate-500 font-bold uppercase"
								>Assinatura do Cliente</span
							>
							<div
								class="h-20 w-48 bg-slate-50 border border-slate-200 rounded-xl mt-1.5 overflow-hidden flex items-center justify-center p-2 print:bg-white print:border-slate-300"
							>
								{#if selectedInspection.clientSignature}
									<img
										src={selectedInspection.clientSignature}
										alt="Assinatura"
										class="h-full object-contain"
									/>
								{:else}
									<span class="text-xs text-slate-400"
										>Nenhuma assinatura capturada</span
									>
								{/if}
							</div>
						</div>
					</div>
				</div>
			</div>
		{:else}
			<!-- Document not found fallback -->
			<div class="max-w-md mx-auto text-center py-24 space-y-4">
				<p class="text-slate-500">
					Laudo de inspeção não encontrado ou indisponível na nuvem...
				</p>
				<button
					onclick={() => goto("/dashboard/checklists")}
					class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl text-sm cursor-pointer transition-all shadow-sm"
				>
					Retornar ao Painel
				</button>
			</div>
		{/if}
	</main>

	<!-- Lightbox Preview Overlay -->
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
					src={selectedInspection.partStates[activePreviewPartKey].photos[
						activePreviewPhotoIndex
					]}
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
						class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl transition-all shadow-md cursor-pointer text-sm"
					>
						Excluir Foto
					</button>
					<button
						type="button"
						onclick={() => {
							activePreviewPartKey = null;
							activePreviewPhotoIndex = null;
						}}
						class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-750"
					>
						Fechar
					</button>
				</div>
			</div>
		</div>
	{/if}

	<!-- Footer -->
	<footer
		class="border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-12 print:hidden"
	>
		<p>© 2026 Checklist Alug. Sincronizado com o servidor Firestore.</p>
	</footer>
</div>

<!-- Custom Delete Confirmation Dialog -->
{#if showDeleteModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-md transition-all duration-300"
	>
		<div
			class="w-full max-w-sm bg-white border border-slate-200 shadow-2xl rounded-3xl p-6 space-y-6 transform scale-100 transition-all"
		>
			<div class="text-center space-y-3">
				<div
					class="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-500 text-xl font-bold"
				>
					⚠️
				</div>
				<h3 class="text-lg font-bold text-slate-800">
					Excluir Inspeção
				</h3>
				<p class="text-xs text-slate-500 max-w-xs mx-auto">
					Tem certeza de que deseja excluir este registro de inspeção da nuvem? Esta
					ação é irreversível.
				</p>
			</div>
			<div class="flex gap-3">
				<button
					onclick={cancelDelete}
					class="flex-1 py-3 text-center text-xs font-bold text-slate-700 hover:text-slate-900 :text-white bg-slate-100 hover:bg-slate-200 :bg-slate-800/80 rounded-xl transition-all cursor-pointer border border-slate-200"
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
