<script>
  import { onMount } from "svelte";
  import { fade, fly } from "svelte/transition";
  import { goto } from "$app/navigation";
  import CarDiagram from "$lib/components/CarDiagram.svelte";
  import SignaturePad from "$lib/components/SignaturePad.svelte";
  import DamageModal from "$lib/components/DamageModal.svelte";
  import { saveInspection, getInspection } from "$lib/db.js";
  import Navbar from "$lib/components/Navbar.svelte";
  import { compressImage } from "$lib/utils/imageCompressor.js";

  // Custom alert / toast states
  let alertMessage = $state("");
  let alertType = $state("error"); // "error", "success", "info"
  let showAlert = $state(false);

  function triggerAlert(message, type = "error") {
    alertMessage = message;
    alertType = type;
    showAlert = true;
  }

  function closeAlert() {
    showAlert = false;
  }

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
  let carDiagramImage = $state(null);

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
    damaged: "Danificado",
  };

  const statusBadgeStyles = {
    scratch: "text-amber-600  border-amber-400/50  bg-amber-50 ",
    dent: "text-orange-600  border-orange-400/50  bg-orange-50 ",
    crack: "text-purple-600  border-purple-400/50  bg-purple-50 ",
    broken: "text-red-600  border-red-400/50  bg-red-50 ",
    damaged: "text-indigo-600  border-indigo-400/50  bg-indigo-50 ",
  };

  onMount(async () => {
    // Set default datetime (local timezone)
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    inspectionDateTime = `${year}-${month}-${day}T${hours}:${minutes}`;

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
          inspectionDateTime = draft.inspectionDateTime || inspectionDateTime;
          clientLicensePhoto = draft.clientLicensePhoto || null;
          clientSignature = draft.clientSignature || null;
          mileage = formatMileage(draft.mileage || "");
          fuelLevel = draft.fuelLevel || "4/8";
          hasDocument = draft.hasDocument || false;
          hasChildSeat = draft.hasChildSeat || false;
          hasEToll = draft.hasEToll || false;
          partStates = draft.partStates || {};
          carDiagramImage = draft.carDiagramImage || null;
          createdAtDate = draft.createdAt || null;
        }
      } catch (e) {
        console.error("Failed to load draft inspection", e);
      }
    }

    // Force light theme
    document.documentElement.classList.remove("dark");
  });

  async function handleLicensePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressedBase64 = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
      });
      clientLicensePhoto = compressedBase64;
    } catch (err) {
      console.error("Falha ao comprimir CNH, utilizando fallback original:", err);
      const reader = new FileReader();
      reader.onload = (event) => {
        clientLicensePhoto = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  function captureCarDiagram() {
    if (typeof document === "undefined") return;
    const originalSvg = document.querySelector(".relative svg");
    if (!originalSvg) return;

    try {
      // Clone the SVG element to keep it pure
      const clonedSvg = originalSvg.cloneNode(true);

      // Find all styleable elements in original and cloned SVGs
      const originalElements = originalSvg.querySelectorAll(
        "path, rect, text, circle",
      );
      const clonedElements = clonedSvg.querySelectorAll(
        "path, rect, text, circle",
      );

      for (let i = 0; i < originalElements.length; i++) {
        const orig = originalElements[i];
        const clone = clonedElements[i];
        const style = window.getComputedStyle(orig);

        // Apply computed colors and visual properties as inline SVG attributes
        clone.setAttribute("fill", style.fill);
        clone.setAttribute("stroke", style.stroke);
        clone.setAttribute("stroke-width", style.strokeWidth || "1px");
        clone.setAttribute("opacity", style.opacity || "1");

        // Remove dynamic interactive classes and handlers to keep the saved image static and clean
        clone.removeAttribute("class");
        clone.removeAttribute("role");
        clone.removeAttribute("tabindex");
        clone.removeAttribute("onclick");
        clone.removeAttribute("onkeydown");
      }

      // Capture visual aspect classes/styles of the main SVG container itself
      clonedSvg.setAttribute(
        "style",
        "background-color: transparent; max-width: 100%; height: auto;",
      );
      clonedSvg.removeAttribute("class");

      // Serialize to XML string
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(clonedSvg);

      // Convert to data URI
      carDiagramImage =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
    } catch (e) {
      console.error("Failed to capture car diagram SVG:", e);
    }
  }

  async function saveDraft() {
    if (!licensePlate || !clientName) {
      triggerAlert("Por favor, insira a placa do veículo e o nome do cliente.");
      return false;
    }

    if (licensePlate.length !== 7) {
      triggerAlert("A placa do veículo deve ter exatamente 7 caracteres.");
      return false;
    }

    if (currentStep === 3) {
      captureCarDiagram();
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
      carDiagramImage,
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
      triggerAlert("Falha ao salvar o rascunho de inspeção.");
      return false;
    }
  }

  async function saveCurrentDraftState() {
    // Only save if general info is filled
    if (!licensePlate || !clientName) return;

    if (currentStep === 3) {
      captureCarDiagram();
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
      carDiagramImage,
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
    closeAlert();
    currentStep = step;
  }

  async function submitInspection() {
    // Validations
    if (!licensePlate || !clientName) {
      triggerAlert("Por favor, insira a placa do veículo e o nome do cliente.");
      return;
    }

    if (licensePlate.length !== 7) {
      triggerAlert("A placa do veículo deve ter exatamente 7 caracteres.");
      return;
    }

    if (!clientLicensePhoto) {
      triggerAlert("A foto da CNH é obrigatória.");
      return;
    }

    if (!clientSignature) {
      triggerAlert("A assinatura do cliente é obrigatória.");
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
      carDiagramImage,
      createdAt: createdAtDate || new Date().toISOString(),
      status: "completed",
      synced: false,
    };

    try {
      await saveInspection($state.snapshot(newReport));
      goto("/dashboard");
    } catch (e) {
      console.error("Failed to save inspection to IndexedDB", e);
      triggerAlert("Falha ao salvar o relatório de inspeção.");
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

  function formatMileage(value) {
    if (typeof value !== "string") value = String(value || "");
    const clean = value.replace(/\D/g, "");
    if (!clean) return "";
    return clean.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
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
  class="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none"
>
  <!-- Top Premium Navbar -->
  <Navbar showDashboard={true} />

  <!-- Custom Premium Toast Alert -->
  {#if showAlert}
    <div
      transition:fly={{ y: -20, duration: 300 }}
      class="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 print:hidden"
    >
      <div
        class="bg-white/95 backdrop-blur-md border-l-4 rounded-2xl shadow-xl p-4 flex items-start gap-3 transition-all duration-300 hover:scale-[1.01] {alertType ===
        'error'
          ? 'border-red-500 shadow-red-200/20'
          : 'border-blue-500 shadow-blue-200/20'}"
      >
        <div class="shrink-0 text-lg">
          {#if alertType === "error"}
            ⚠️
          {:else}
            ℹ️
          {/if}
        </div>
        <div class="flex-1">
          <h4 class="text-sm font-bold text-slate-900 leading-tight">
            {#if alertType === "error"}
              Atenção
            {:else}
              Informação
            {/if}
          </h4>
          <p class="text-xs text-slate-600 mt-1 font-semibold leading-relaxed">
            {alertMessage}
          </p>
        </div>
        <button
          type="button"
          onclick={closeAlert}
          class="shrink-0 p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          aria-label="Fechar"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.5"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  {/if}

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
          <h2 class="text-2xl font-black text-slate-900">Novo Checklist</h2>
        </div>

        <!-- Progress Tracker Bar -->
        <div
          class="w-full sm:w-auto flex items-center gap-1 sm:gap-2 bg-slate-200/60 p-1.5 rounded-xl border border-slate-300/40"
        >
          {#each [{ step: 1, label: "Detalhes", short: "Info" }, { step: 2, label: "Interior", short: "Int" }, { step: 3, label: "Mapa de Danos", short: "Mapa" }, { step: 4, label: "Conclusão", short: "Fim" }] as item (item.step)}
            <button
              onclick={() => goToStep(item.step)}
              class="flex-1 sm:flex-initial px-2 py-1.5 sm:px-3 rounded-lg text-[10px] sm:text-xs font-bold transition-all cursor-pointer text-center {currentStep ===
              item.step
                ? 'bg-primary text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800 :text-slate-300'}"
            >
              <span class="inline sm:hidden">{item.step}. {item.short}</span>
              <span class="hidden sm:inline">{item.step}. {item.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- STEP 1: GENERAL INFO -->
      {#if currentStep === 1}
        <div
          class="bg-white border border-slate-200/80 shadow-xl shadow-slate-200/30 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl"
        >
          <div class="border-b border-slate-100 pb-4">
            <h3 class="text-lg font-bold text-slate-800">Detalhes</h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Tipo de Inspeção -->
            <div class="col-span-1 md:col-span-2">
              <span class="block text-sm font-semibold text-slate-700 mb-2">
                Tipo de Inspeção
              </span>
              <div class="grid grid-cols-2 gap-3 max-w-md">
                <button
                  type="button"
                  onclick={() => (inspectionType = "Entrega")}
                  class="py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer border text-center flex items-center justify-center gap-2 {inspectionType ===
                  'Entrega'
                    ? 'bg-primary text-white border-transparent shadow-md scale-[1.02]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 :bg-slate-800'}"
                >
                  🔑 Entrega
                </button>
                <button
                  type="button"
                  onclick={() => (inspectionType = "Retirada")}
                  class="py-3 rounded-xl text-sm font-extrabold transition-all cursor-pointer border text-center flex items-center justify-center gap-2 {inspectionType ===
                  'Retirada'
                    ? 'bg-primary text-white border-transparent shadow-md scale-[1.02]'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 :bg-slate-800'}"
                >
                  🚗 Retirada
                </button>
              </div>
            </div>

            <div>
              <label
                class="block text-sm font-semibold text-slate-700 mb-1.5"
                for="inp-plate"
              >
                Placa do Veículo *
              </label>
              <input
                id="inp-plate"
                type="text"
                bind:value={licensePlate}
                oninput={(e) => {
                  licensePlate = e.target.value
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 7);
                }}
                placeholder="ex: XYZ1234"
                maxlength="7"
                class="w-full bg-slate-50 border border-slate-200 focus:border-primary rounded-xl px-4 py-3 text-slate-900 outline-none uppercase font-bold tracking-wider transition-all placeholder:normal-case placeholder:font-normal placeholder:tracking-normal text-sm"
              />
              <p
                class="mt-1.5 text-xs font-semibold {licensePlate.length === 7
                  ? 'text-emerald-600'
                  : 'text-slate-400'} flex items-center gap-1.5 transition-all"
              >
                {#if licensePlate.length === 7}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Placa válida (7 caracteres)
                {:else if licensePlate.length > 0}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="h-4 w-4 text-amber-500"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  <span
                    >Precisa ter exatamente 7 caracteres (digitado: {licensePlate.length}/7)</span
                  >
                {:else}
                  <span>Digite os 7 caracteres da placa (letras e números)</span
                  >
                {/if}
              </p>
            </div>

            <div>
              <label
                class="block text-sm font-semibold text-slate-700 mb-1.5"
                for="inp-datetime"
              >
                Data & Hora
              </label>
              <input
                id="inp-datetime"
                type="datetime-local"
                bind:value={inspectionDateTime}
                class="w-full bg-slate-50 border border-slate-200 focus:border-primary rounded-xl px-4 py-3 text-slate-900 outline-none transition-all text-sm font-semibold"
              />
            </div>

            <div>
              <label
                class="block text-sm font-semibold text-slate-700 mb-1.5"
                for="inp-inspector"
              >
                Nome do Inspetor
              </label>
              <input
                id="inp-inspector"
                type="text"
                bind:value={inspectorName}
                placeholder="ex: Inspetor Carlos"
                class="w-full bg-slate-50 border border-slate-200 focus:border-primary rounded-xl px-4 py-3 text-slate-900 outline-none transition-all text-sm"
                readonly
              />
            </div>

            <div>
              <label
                class="block text-sm font-semibold text-slate-700 mb-1.5"
                for="inp-client"
              >
                Nome do Cliente / Proprietário *
              </label>
              <input
                id="inp-client"
                type="text"
                bind:value={clientName}
                placeholder="ex: João Silva"
                class="w-full bg-slate-50 border border-slate-200 focus:border-primary rounded-xl px-4 py-3 text-slate-900 outline-none transition-all text-sm"
              />
            </div>
          </div>

          <div class="flex justify-end pt-4 border-t border-slate-100">
            <button
              onclick={async () => {
                const saved = await saveDraft();
                if (saved) {
                  currentStep = 2;
                }
              }}
              class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer text-sm"
            >
              Interior
            </button>
          </div>
        </div>
      {/if}

      <!-- STEP 2: INTERIOR CABIN -->
      {#if currentStep === 2}
        <div
          class="bg-white border border-slate-200/80 shadow-xl shadow-slate-200/30 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl animate-fade-in"
        >
          <div class="border-b border-slate-100 pb-4">
            <h3 class="text-lg font-bold text-slate-800">Status do Interior</h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Mileage Input -->
            <div class="space-y-2">
              <label
                class="block text-sm font-semibold text-slate-700"
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
                  oninput={(e) => {
                    mileage = formatMileage(e.target.value);
                  }}
                  placeholder="ex: 45.000"
                  class="w-full bg-slate-50 border border-slate-200 focus:border-primary rounded-xl ps-10 pe-4 py-3 text-slate-900 outline-none font-bold transition-all text-sm"
                />
              </div>
            </div>

            <!-- Fuel Level segmented buttons -->
            <div class="col-span-1 md:col-span-2 space-y-2">
              <span class="block text-sm font-semibold text-slate-700">
                Nível de Combustível
              </span>
              <div
                class="bg-slate-50 border border-slate-200/80 rounded-2xl p-4"
              >
                <div class="grid grid-cols-3 sm:grid-cols-9 gap-2">
                  {#each ["0/8", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8"] as level (level)}
                    <button
                      type="button"
                      onclick={() => (fuelLevel = level)}
                      class="py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer border text-center {fuelLevel ===
                      level
                        ? 'bg-primary text-white border-transparent shadow-sm'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100 :bg-slate-800'}"
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
              <span class="block text-sm font-semibold text-slate-700">
                Itens Presentes na Cabine
              </span>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <!-- Document Switch -->
                <button
                  type="button"
                  onclick={() => (hasDocument = !hasDocument)}
                  class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasDocument
                    ? 'border-primary bg-primary/5 shadow-sm shadow-primary/5'
                    : 'border-slate-200 bg-white hover:bg-slate-50 :bg-slate-800/40'}"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-xl">📄</span>
                    <div>
                      <span class="block text-xs font-bold text-slate-800">
                        Documento do Veículo
                      </span>
                      <span class="text-[10px] text-slate-400 font-medium"
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
                      class="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"
                    ></div>
                  </div>
                </button>

                <!-- E-Toll Tag Switch -->
                <button
                  type="button"
                  onclick={() => (hasEToll = !hasEToll)}
                  class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasEToll
                    ? 'border-primary bg-primary/5 shadow-sm shadow-primary/5'
                    : 'border-slate-200 bg-white hover:bg-slate-50 :bg-slate-800/40'}"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-xl">🏷️</span>
                    <div>
                      <span class="block text-xs font-bold text-slate-800">
                        Tag de Pedágio
                      </span>
                      <span class="text-[10px] text-slate-400 font-medium"
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
                      class="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"
                    ></div>
                  </div>
                </button>

                <!-- Child Seat Switch -->
                <button
                  type="button"
                  onclick={() => (hasChildSeat = !hasChildSeat)}
                  class="text-left w-full cursor-pointer border rounded-2xl p-4 flex items-center justify-between transition-all select-none {hasChildSeat
                    ? 'border-primary bg-primary/5 shadow-sm shadow-primary/5'
                    : 'border-slate-200 bg-white hover:bg-slate-50 :bg-slate-800/40'}"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-xl">👶</span>
                    <div>
                      <span class="block text-xs font-bold text-slate-800">
                        Cadeirinha de Bebê
                      </span>
                      <span class="text-[10px] text-slate-400 font-medium"
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
                      class="w-9 h-5 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:inset-s-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"
                    ></div>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div
            class="flex justify-between items-center pt-4 border-t border-slate-100"
          >
            <button
              onclick={async () => {
                await saveCurrentDraftState();
                currentStep = 1;
              }}
              class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 :bg-slate-850 text-slate-700 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200"
            >
              Detalhes
            </button>

            <button
              onclick={async () => {
                if (!mileage) {
                  triggerAlert("Por favor, insira a quilometragem do veículo.");
                  return;
                }
                await saveCurrentDraftState();
                currentStep = 3;
              }}
              class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer text-sm border border-transparent"
            >
              Danos
            </button>
          </div>
        </div>
      {/if}

      <!-- STEP 3: DAMAGE MAP -->
      {#if currentStep === 3}
        <div
          class="bg-white border border-slate-200/80 shadow-xl shadow-slate-200/30 rounded-2xl sm:rounded-3xl p-3 sm:p-8 space-y-4 sm:space-y-6 backdrop-blur-xl animate-fade-in"
        >
          <div class="border-b border-slate-100 pb-4">
            <h3 class="text-lg font-bold text-slate-800">Danos</h3>
          </div>

          <!-- Insert the visual interactive diagram -->
          <CarDiagram bind:activePart={activePartId} {partStates} />

          <div
            class="flex justify-between items-center pt-4 border-t border-slate-100"
          >
            <button
              onclick={async () => {
                await saveCurrentDraftState();
                currentStep = 2;
              }}
              class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 :bg-slate-850 text-slate-700 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200"
            >
              Interior
            </button>

            <button
              onclick={async () => {
                await saveCurrentDraftState();
                currentStep = 4;
              }}
              class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold rounded-xl transition-all shadow-sm hover:shadow-md cursor-pointer text-sm border border-transparent"
            >
              Assinatura
            </button>
          </div>
        </div>
      {/if}

      <!-- STEP 4: CLIENT SIGN-OFF -->
      {#if currentStep === 4}
        <div
          class="bg-white border border-slate-200/80 shadow-xl shadow-slate-200/30 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-xl"
        >
          <div class="border-b border-slate-100 pb-4">
            <h3 class="text-lg font-bold text-slate-800">
              Assinatura do Cliente
            </h3>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- Left Summary info column -->
            <div
              class="space-y-4 bg-slate-50 border border-slate-200/80 rounded-2xl p-4"
            >
              <h4
                class="text-sm font-bold text-slate-800 uppercase tracking-wide border-b border-slate-200 pb-2"
              >
                Resumo da Inspeção
              </h4>

              <div class="space-y-3 text-sm">
                <div class="flex justify-between">
                  <span class="text-slate-500">Placa:</span>
                  <span class="font-bold text-slate-900 uppercase"
                    >{licensePlate || "N/A"}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Tipo:</span>
                  <span class="font-semibold text-slate-900"
                    >{inspectionType}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Cliente:</span>
                  <span class="font-semibold text-slate-900"
                    >{clientName || "N/A"}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Inspetor:</span>
                  <span class="text-slate-800">{inspectorName || "N/A"}</span>
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Data/Hora:</span>
                  <span class="text-slate-800"
                    >{formatDateTime(inspectionDateTime)}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Quilometragem:</span>
                  <span class="font-semibold text-slate-800"
                    >{mileage ? mileage + " km" : "N/A"}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Combustível:</span>
                  <span class="font-semibold text-slate-800"
                    >{fuelLevel || "N/A"}</span
                  >
                </div>
                <div class="flex justify-between">
                  <span class="text-slate-500">Itens da Cabine:</span>
                  <span class="text-xs text-slate-755 text-right font-medium">
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
                  class="flex justify-between border-t border-slate-200 pt-2"
                >
                  <span class="text-slate-500">Danos Registrados:</span>
                  <span class="font-black text-amber-600">
                    {countDamages(partStates)} partes marcadas
                  </span>
                </div>
              </div>

              <!-- Mini summary list of damages -->
              <div class="space-y-2 mt-4 text-xs max-h-40 overflow-y-auto">
                {#each Object.keys(partStates) as partKey (partKey)}
                  {#if partStates[partKey].status !== "none"}
                    <div
                      class="flex justify-between items-center bg-white p-2 rounded-lg border border-slate-200/60"
                    >
                      <span class="font-bold text-slate-700"
                        >{partNames[partKey] || partKey}</span
                      >
                      <div class="flex gap-2 items-center">
                        <span
                          class="px-2 py-0.5 text-[9px] font-black uppercase rounded border {statusBadgeStyles[
                            partStates[partKey].status
                          ] || 'bg-slate-50 border-slate-200 text-slate-600 '}"
                        >
                          {statusLabels[partStates[partKey].status] ||
                            partStates[partKey].status}
                        </span>
                        {#if partStates[partKey].photos?.length > 0}
                          <span class="text-slate-500 font-bold"
                            >📸 {partStates[partKey].photos.length}</span
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
                <div class="flex justify-between items-center mb-1.5">
                  <label
                    class="block text-sm font-semibold text-slate-700"
                    for="inp-license-upload"
                  >
                    Foto da CNH (Motorista) *
                  </label>
                </div>

                <div
                  class="min-h-[160px] bg-slate-50 border border-slate-200 rounded-2xl relative overflow-hidden flex flex-col items-center justify-center p-3"
                >
                  {#if clientLicensePhoto}
                    <img
                      src={clientLicensePhoto}
                      alt="CNH do Cliente"
                      class="w-full h-32 object-contain rounded-xl"
                    />

                    <button
                      onclick={() => (clientLicensePhoto = null)}
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
                        class="h-8 w-8 text-slate-400"
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
                      <span class="text-xs font-bold text-slate-500"
                        >Clique para Enviar ou Arraste a Foto</span
                      >
                      <span class="text-[10px] text-slate-400"
                        >Suporta PNG, JPG ou Câmera do Celular</span
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
                  class="block text-sm font-semibold text-slate-700 mb-2"
                >
                  Assinatura de Autorização do Cliente *
                </label>
                <div>
                  <SignaturePad bind:signature={clientSignature} />
                </div>
              </div>
            </div>
          </div>

          <div
            class="flex justify-between items-center pt-4 border-t border-slate-100"
          >
            <button
              onclick={async () => {
                await saveCurrentDraftState();
                currentStep = 3;
              }}
              class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 :bg-slate-700 text-slate-700 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200"
            >
              Danos
            </button>

            <button
              onclick={submitInspection}
              class="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-extrabold rounded-xl transition-all shadow-lg shadow-neutral-950/10 hover:shadow-neutral-950/20 cursor-pointer text-sm border border-transparent"
            >
              Concluir
            </button>
          </div>
        </div>
      {/if}
    </div>
  </main>

  <!-- Footer -->
  <footer
    class="border-t border-slate-200 py-6 text-center text-xs text-slate-500 mt-12 print:hidden"
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
