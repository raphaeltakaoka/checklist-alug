<script>
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { db } from "$lib/firebase.js";
	import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
	import Navbar from "$lib/components/Navbar.svelte";

	// Page states
	let checklists = $state([]);
	let loading = $state(true);
	let errorMsg = $state("");

	// Search & Filter state
	let searchQuery = $state("");
	let filterType = $state("All");

	onMount(async () => {
		try {
			// Query the last 20 checklists from Cloud Firestore ordered by inspection date
			const q = query(
				collection(db, "checklists"),
				orderBy("inspectionDateTime", "desc"),
				limit(20)
			);
			const querySnapshot = await getDocs(q);
			let list = [];
			querySnapshot.forEach((doc) => {
				list.push(doc.data());
			});
			checklists = list;
		} catch (e) {
			console.error("Failed to load checklists from Firestore:", e);
			errorMsg = "Falha ao carregar os checklists da nuvem. Verifique sua conexão.";
		} finally {
			loading = false;
		}

		// Force light theme
		document.documentElement.classList.remove("dark");
	});

	// Filter checklists based on search query and type filter
	const filteredChecklists = $derived(
		checklists.filter((i) => {
			const matchesSearch =
				i.licensePlate.toLowerCase().includes(searchQuery.toLowerCase()) ||
				i.clientName.toLowerCase().includes(searchQuery.toLowerCase());
			
			const matchesType =
				filterType === "All" || i.inspectionType === filterType;

			return matchesSearch && matchesType;
		})
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
	<title>Checklists na Nuvem - Checklist Alug</title>
	<meta
		name="description"
		content="Checklist Alug - Veja relatórios de inspeção anteriores armazenados na nuvem."
	/>
</svelte:head>

<div
	class="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none"
>
	<!-- Top Premium Navbar -->
	<Navbar showDashboard={true} />

	<!-- Main Body Wrapper -->
	<main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6">
		<div class="space-y-6">
			<!-- Hero Summary Dashboard -->
			<div
				class="bg-white border border-slate-200 shadow-md rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6"
			>
				<div>
					<h2
						class="text-2xl sm:text-3xl font-black text-slate-900 leading-tight"
					>
						Vistorias na Nuvem
					</h2>
					<p class="text-xs text-slate-500 mt-2">
						Central de auditoria digital mostrando as últimas 20 vistorias sincronizadas na nuvem.
					</p>
				</div>

				<button
					onclick={() => goto("/dashboard")}
					class="w-full md:w-auto px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 :bg-slate-850 text-slate-700 font-bold rounded-2xl text-sm transition-all cursor-pointer shadow-sm flex items-center justify-center gap-2"
				>
					← Voltar ao Painel
				</button>
			</div>

			<!-- Search & Filter Controls -->
			<div
				class="flex flex-col md:flex-row gap-4 items-center justify-between mt-6"
			>
				<div>
					<h3
						class="text-lg font-bold text-slate-800"
					>
						Histórico de Checklists
					</h3>
					<p class="text-xs text-slate-500">
						Exibindo os laudos e assinaturas mais recentes do servidor.
					</p>
				</div>

				<div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
					<!-- Search bar -->
					<div class="relative w-full sm:w-64">
						<input
							type="text"
							bind:value={searchQuery}
							placeholder="Buscar por placa ou cliente..."
							class="w-full bg-white border border-slate-200 focus:border-primary rounded-xl pl-10 pr-4 py-2.5 text-slate-800 outline-none transition-all placeholder:text-slate-400 text-sm"
						/>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-4.5 w-4.5 text-slate-400 absolute left-3 top-3.5"
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
 
					<!-- Filter dropdown -->
					<select
						bind:value={filterType}
						class="bg-white border border-slate-200 focus:border-primary rounded-xl px-4 py-2.5 text-slate-800 text-sm outline-none transition-all cursor-pointer font-bold"
					>
						<option value="All">Todos os tipos</option>
						<option value="Entrega">🔑 Entrega</option>
						<option value="Retirada">🚗 Retirada</option>
					</select>
				</div>
			</div>

			<!-- Grid List / Loading / Error / Empty States -->
			{#if loading}
				<!-- Skeleton Loader -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
					{#each Array(6) as _, i (i)}
						<div
							class="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 animate-pulse"
						>
							<div class="h-6 w-1/3 bg-slate-200 rounded-lg"></div>
							<div class="h-16 bg-slate-100 rounded-xl"></div>
							<div class="h-10 bg-slate-200 rounded-xl"></div>
						</div>
					{/each}
				</div>
			{:else if errorMsg}
				<div
					class="p-12 mt-6 border border-red-250 bg-red-50/20 rounded-3xl text-center space-y-4"
				>
					<div
						class="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto text-red-600 text-xl font-bold"
					>
						⚠️
					</div>
					<div class="space-y-1">
						<h4 class="text-base font-bold text-red-600">Falha ao conectar</h4>
						<p class="text-xs text-slate-500 max-w-xs mx-auto">{errorMsg}</p>
					</div>
					<button
						onclick={() => window.location.reload()}
						class="px-5 py-2.5 bg-red-650 hover:bg-red-500 text-white font-bold rounded-xl text-xs transition-all cursor-pointer"
					>
						Tentar Novamente
					</button>
				</div>
			{:else if filteredChecklists.length === 0}
				<div
					class="p-12 mt-6 border border-dashed border-slate-350 bg-white rounded-3xl text-center space-y-4"
				>
					<div
						class="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto text-slate-400"
					>
						📋
					</div>
					<div class="space-y-1">
						<h4 class="text-base font-bold text-slate-800">
							Nenhum checklist correspondente
						</h4>
						<p class="text-xs text-slate-500 max-w-xs mx-auto">
							{searchQuery || filterType !== "All"
								? "Nenhum resultado corresponde aos filtros de busca atuais."
								: "Nenhum checklist sincronizado na nuvem foi encontrado."}
						</p>
					</div>
				</div>
			{:else}
				<!-- Grid checklists list -->
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
					{#each filteredChecklists as rep (rep.id || rep.licensePlate + rep.inspectionDateTime)}
						<div
							class="bg-white hover:bg-slate-50/50 :bg-slate-900/60 border border-slate-200 hover:border-slate-300 :border-slate-800 shadow-sm hover:shadow-md rounded-2xl p-5 transition-all flex flex-col justify-between group relative overflow-hidden"
						>
							<div class="flex justify-between items-start">
								<div>
									<span
										class="text-[10px] text-slate-500 uppercase tracking-widest font-extrabold"
										>Placa do Veículo</span
									>
									<h4
										class="text-xl font-black text-slate-900 uppercase tracking-wider mt-0.5"
									>
										{rep.licensePlate}
									</h4>
								</div>

								<div class="flex flex-col items-end gap-1.5">
									{#if rep.inspectionType}
										<span
											class="px-2 py-0.5 text-[9px] font-black uppercase rounded border {rep.inspectionType === 'Entrega' ? 'bg-slate-100 text-slate-800 border-slate-200 ' : 'bg-emerald-50 text-emerald-600 border-emerald-200 '}"
										>
											{rep.inspectionType === "Entrega"
												? "🔑 Entrega"
												: "🚗 Retirada"}
										</span>
									{/if}
									<span
										class="px-2.5 py-1 text-[10px] font-black uppercase rounded-lg bg-slate-50 border border-slate-200 text-amber-600"
									>
										{countDamages(rep.partStates)} Danos
									</span>
								</div>
							</div>

							<!-- Customer, inspector & date details -->
							<div
								class="my-5 space-y-2 text-xs border-t border-slate-100 pt-4"
							>
								<div class="flex justify-between">
									<span class="text-slate-500">Cliente:</span>
									<span class="font-semibold text-slate-700"
										>{rep.clientName}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500">Inspetor:</span>
									<span class="text-slate-600"
										>{rep.inspectorName || "N/A"}</span
									>
								</div>
								<div class="flex justify-between">
									<span class="text-slate-500">Data:</span>
									<span class="text-slate-600"
										>{(() => {
											const d = new Date(rep.inspectionDateTime);
											const dateStr = d.toLocaleDateString("pt-BR");
											const timeStr = d.toLocaleTimeString("pt-BR", {
												hour: "2-digit",
												minute: "2-digit",
											});
											return `${dateStr} às ${timeStr}`;
										})()}</span
									>
								</div>
							</div>

							<!-- Card Action -->
							<button
								onclick={() => goto("/dashboard/checklists/" + rep.id)}
								class="w-full py-2.5 text-center text-xs font-bold text-white bg-primary hover:bg-primary-hover rounded-xl transition-all cursor-pointer shadow-sm hover:shadow"
							>
								Visualizar Laudo Completo
							</button>

							<!-- Ambient hover background gradient -->
							<div
								class="absolute inset-0 rounded-2xl bg-linear-to-tr from-neutral-500/2 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
							></div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</main>

	<!-- Footer -->
	<footer
		class="border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-12"
	>
		<p>© 2026 Checklist Alug. Sincronizado com o servidor Firestore.</p>
	</footer>
</div>
