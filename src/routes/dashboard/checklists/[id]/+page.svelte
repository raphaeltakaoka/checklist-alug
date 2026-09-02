<script>
  import { onMount } from "svelte";
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { db } from "$lib/firebaseDb.js";
  import { doc, getDoc } from "firebase/firestore";
  import { saveInspection as saveToDB } from "$lib/db.js";
  import logo from "$lib/assets/logo_alug_locadora.png";
  import Navbar from "$lib/components/Navbar.svelte";
  import { normalizeCloudInspection } from '$lib/inspection.js';
  import { authenticatedFetch } from '$lib/api.js';
  import {
    PART_NAMES as partNames,
    STATUS_BADGE_STYLES as statusBadgeStyles,
    STATUS_LABELS as statusLabels,
    countDamages,
  } from '$lib/inspection.js';

  // Retrieve route params reactively
  let id = $derived($page.params.id);

  let selectedInspection = $state(null);
  let loading = $state(true);

  // Lightbox active preview state
  let activePreviewPartKey = $state(null);
  let activePreviewPhotoIndex = $state(null);


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
		selectedInspection = normalizeCloudInspection(docSnap.data(), docSnap.id);
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

  async function deletePhotoFromInspection(partKey, photoIndex) {
    if (
      selectedInspection &&
      selectedInspection.partStates?.[partKey]?.photos
    ) {
		const previousPartStates = structuredClone($state.snapshot(selectedInspection.partStates));
		const photoPath = selectedInspection.partStates[partKey].photoPaths?.[photoIndex];
		if (!photoPath) {
			alert("Esta foto não possui um caminho de armazenamento válido.");
			return;
		}
      selectedInspection.partStates[partKey].photos =
        selectedInspection.partStates[partKey].photos.filter(
          (_, idx) => idx !== photoIndex,
        );
		selectedInspection.partStates[partKey].photoPaths =
			selectedInspection.partStates[partKey].photoPaths.filter((_, idx) => idx !== photoIndex);

      try {
		const response = await authenticatedFetch(
		  `/api/checklists/${encodeURIComponent(selectedInspection.id)}/photos`,
		  {
			method: 'DELETE',
			body: JSON.stringify({ partKey, photoPath }),
		  },
		);
		const payload = await response.json();
		selectedInspection.partStates = payload.partStates;

        // Also update local IndexedDB if cached
        try {
          await saveToDB($state.snapshot(selectedInspection));
        } catch (e) {
          console.warn("Could not save to local IndexedDB:", e);
        }
      } catch (e) {
		selectedInspection.partStates = previousPartStates;
        console.error("Failed to delete photo from Firestore checklist:", e);
        alert("Falha ao excluir a foto.");
      }
    }
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
        <div
          class="relative w-14 h-14 flex items-center justify-center mx-auto"
        >
          <div
            class="absolute inset-0 rounded-full border-4 border-slate-100"
          ></div>
          <div
            class="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
          ></div>
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
            class="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50  text-slate-700 font-bold rounded-xl text-sm transition-all cursor-pointer shadow-xs"
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
                class="flex items-center justify-center p-1 bg-white rounded-lg border border-slate-200 shadow-xs"
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
              </div>
            </div>
          </div>

          <!-- Details Grid -->
          <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 my-8"
          >
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
                <span class="font-semibold text-slate-800 print:text-black"
                  >{selectedInspection.inspectorName || "N/A"}</span
                >

                <span class="text-slate-500">Cliente / Proprietário:</span>
                <span class="font-semibold text-slate-800 print:text-black"
                  >{selectedInspection.clientName}</span
                >

                <span class="text-slate-500">Data & Hora:</span>
                <span class="text-slate-700 print:text-black"
                  >{new Date(
                    selectedInspection.inspectionDateTime,
                  ).toLocaleString()}</span
                >

                <span class="text-slate-500">Relatório Salvo em:</span>
                <span class="text-slate-500 print:text-slate-600"
                  >{new Date(
                    selectedInspection.createdAt,
                  ).toLocaleString()}</span
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
                <span class="font-semibold text-slate-800 print:text-black"
                  >{selectedInspection.mileage
                    ? selectedInspection.mileage + " km"
                    : "N/A"}</span
                >

                <span class="text-slate-500">Nível de Combustível:</span>
                <span class="font-semibold text-slate-800 print:text-black"
                  >{selectedInspection.fuelLevel || "N/A"}</span
                >

                <span class="text-slate-500">Documento do Veículo:</span>
                <span class="text-slate-800 print:text-black"
                  >{selectedInspection.hasDocument
                    ? "✅ Presente"
                    : "❌ Ausente"}</span
                >

                <span class="text-slate-500">Tag de Pedágio:</span>
                <span class="text-slate-800 print:text-black"
                  >{selectedInspection.hasEToll
                    ? "✅ Presente"
                    : "❌ Ausente"}</span
                >

                <span class="text-slate-500">Cadeirinha Infantil:</span>
                <span class="text-slate-800 print:text-black"
                  >{selectedInspection.hasChildSeat
                    ? "✅ Presente"
                    : "❌ Ausente"}</span
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
                    loading="lazy"
                    class="w-full h-full object-contain"
                  />
                </div>
              </div>
            {/if}
          </div>

          <!-- Damage mapping details list -->
          <div class="my-8 space-y-6">
            <h3
              class="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 pb-1.5 print:border-slate-300"
            >
              Laudo de Mapeamento de Danos
            </h3>

            {#if selectedInspection.carDiagramImage}
              <!-- Premium Stacked Car Diagram Card -->
              <div
                class="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-3xl print:bg-white print:border-slate-300 max-w-lg mx-auto w-full shadow-xs animate-fade-in"
              >
                <img
                  src={selectedInspection.carDiagramImage}
                  alt="Mapa de Danos do Veículo"
                  loading="lazy"
                  class="w-full h-auto select-none max-h-[350px] object-contain"
                />
                <span
                  class="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-3"
                  >Mapa Visual de Danos Registrados</span
                >
              </div>
            {/if}

            {#if countDamages(selectedInspection.partStates) === 0}
              <div
                class="p-6 bg-slate-50 rounded-2xl border border-slate-200 text-center text-slate-500 print:bg-slate-100 print:border-slate-200"
              >
                Nenhum dano visual ou mecânico foi registrado durante esta
                inspeção.
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
                          class="px-3 py-1 text-xs font-black uppercase rounded-lg border {statusBadgeStyles[
                            selectedInspection.partStates[partKey].status
                          ] ||
                            'bg-white border-slate-200 text-slate-600 print:text-slate-600 print:border-slate-400'}"
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
                                loading="lazy"
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
                    loading="lazy"
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
            class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-700"
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

<style>
  @media print {
    :global(body) {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
