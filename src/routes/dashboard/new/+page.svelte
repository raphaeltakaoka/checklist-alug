<script>
  import { onMount, tick } from "svelte";
  import { beforeNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import { authState } from "$lib/auth.svelte.js";
  import { ui } from "$lib/ui.svelte.js";
  import { authenticatedFetch } from "$lib/api.js";
  import { db } from "$lib/firebaseDb.js";
  import { doc, getDoc } from "firebase/firestore";
  import {
    findLocalDeliveryInspection,
    getInspection,
    getStorageEstimate,
    requestPersistentStorage,
    saveInspection,
  } from "$lib/db.js";
  import { compressImage } from "$lib/utils/imageCompressor.js";
  import { mediaPreviewUrl, revokeMediaPreview } from "$lib/mediaPreview.js";
  import {
    PART_NAMES,
    STATUS_LABELS,
    calculateFuelDiff,
    calculateMileageDiff,
    countDamages,
    countNewDamages,
    detectNewDamages,
    formatInspectionDateTime,
    formatMileage,
    normalizeCloudInspection,
  } from "$lib/inspection.js";
  import { createInspectionWriter, inspectionErrors, firstErrorStep } from "$lib/inspectionForm.js";
  import Icon from "$lib/components/Icon.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import Dialog from "$lib/components/Dialog.svelte";
  import CarDiagram from "$lib/components/CarDiagram.svelte";
  import DamageModal from "$lib/components/DamageModal.svelte";
  import SignaturePad from "$lib/components/SignaturePad.svelte";
  let report = $state({
    id: "ins-" + crypto.randomUUID(),
    ownerUid: "",
    licensePlate: "",
    inspectionType: "Entrega",
    inspectorName: "",
    clientName: "",
    inspectionDateTime: "",
    clientLicensePhoto: null,
    clientSignature: null,
    carDiagramImage: null,
    mileage: "",
    fuelLevel: "4/8",
    hasDocument: false,
    hasChildSeat: false,
    hasEToll: false,
    partStates: {},
    deliveryChecklistId: null,
    deliverySnapshot: null,
    newDamageCount: 0,
    createdAt: new Date().toISOString(),
  });
  let step = $state(1);
  let hydrated = $state(false);
  let loadError = $state("");
  let errors = $state({});
  let saveState = $state("idle");
  let saveError = $state("");
  let storageWarning = $state("");
  let busy = $state(false);
  let processing = $state(false);
  let photoError = $state("");
  let activePart = $state(null);
  let damageView = $state("map");
  let diagram = $state(null);
  let formRoot;
  let cameraInput = $state(null);
  let galleryInput = $state(null);
  let writer;
  let allowLeave = false;
  let leaveTarget = $state(null);
  let discardOpen = $state(false);
  let alive = true;
  let searchingDelivery = $state(false);
  let deliverySearchResults = $state([]);
  let deliveryPickerOpen = $state(false);
  let deliverySearchError = $state("");

  let eligible = $derived(report.licensePlate.length === 7 && !!report.clientName.trim());
  let photoCount = $derived(
    Object.values(report.partStates).reduce((sum, part) => sum + (part.photos?.length || 0), 0),
  );
  let mileageDiff = $derived(
    report.deliverySnapshot?.mileage
      ? calculateMileageDiff(report.deliverySnapshot.mileage, report.mileage)
      : null,
  );
  let fuelDiff = $derived(
    report.deliverySnapshot?.fuelLevel
      ? calculateFuelDiff(report.deliverySnapshot.fuelLevel, report.fuelLevel)
      : null,
  );
  let newDamages = $derived(
    report.inspectionType === "Devolução"
      ? detectNewDamages(report.partStates, report.deliverySnapshot?.partStates)
      : [],
  );
  const steps = ["Detalhes", "Interior", "Danos", "Conclusão"];
  function snapshot(status = "draft") {
    const snap = $state.snapshot(report);
    return {
      ...snap,
      newDamageCount: countNewDamages(snap.partStates),
      status,
      syncState: status === "completed" ? "queued" : "draft",
      synced: false,
      retryCount: 0,
      lastSyncError: "",
    };
  }

  function applyDelivery(delivery) {
    if (!delivery) return;
    report.deliveryChecklistId = delivery.id;
    report.deliverySnapshot = {
      id: delivery.id,
      inspectionDateTime: delivery.inspectionDateTime,
      inspectorName: delivery.inspectorName || "",
      clientName: delivery.clientName || "",
      mileage: delivery.mileage || "",
      fuelLevel: delivery.fuelLevel || "4/8",
      hasDocument: Boolean(delivery.hasDocument),
      hasChildSeat: Boolean(delivery.hasChildSeat),
      hasEToll: Boolean(delivery.hasEToll),
      partStates: delivery.partStates || {},
    };
    if (delivery.clientName && !report.clientName) {
      report.clientName = delivery.clientName;
    }
    report.hasDocument = Boolean(delivery.hasDocument);
    report.hasChildSeat = Boolean(delivery.hasChildSeat);
    report.hasEToll = Boolean(delivery.hasEToll);
    if (delivery.clientLicensePhoto && !report.clientLicensePhoto) {
      report.clientLicensePhoto = delivery.clientLicensePhoto;
    }

    // Copy delivery part damages as pre-existing
    const preExistingParts = {};
    for (const [partId, state] of Object.entries(delivery.partStates || {})) {
      if (state?.status && state.status !== "none") {
        preExistingParts[partId] = {
          status: state.status,
          comments: state.comments || "",
          photos: [],
          photoPaths: [],
          isNewDamage: false,
          deliveryStatus: state.status,
          deliveryComments: state.comments || "",
          deliveryPhotos: Array.isArray(state.photos) ? [...state.photos] : [],
        };
      }
    }
    report.partStates = { ...report.partStates, ...preExistingParts };
    deliveryPickerOpen = false;
    deliverySearchError = "";
  }

  function clearDelivery() {
    report.deliveryChecklistId = null;
    report.deliverySnapshot = null;
    const remainingParts = {};
    for (const [partId, state] of Object.entries(report.partStates || {})) {
      if (state?.isNewDamage) {
        remainingParts[partId] = {
          ...state,
          deliveryStatus: "",
          deliveryComments: "",
          deliveryPhotos: [],
        };
      }
    }
    report.partStates = remainingParts;
  }

  async function searchDelivery(plate) {
    const clean = (plate || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    if (clean.length !== 7) return;
    searchingDelivery = true;
    deliverySearchError = "";
    try {
      const localMatches = await findLocalDeliveryInspection(authState.user.uid, clean).catch(
        () => [],
      );
      let allMatches = [...localMatches];
      if (typeof navigator !== "undefined" && navigator.onLine) {
        const res = await authenticatedFetch(
          `/api/checklists/delivery-lookup?plate=${encodeURIComponent(clean)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const remote = data.deliveries || [];
          const localIds = new Set(localMatches.map(m => m.id));
          const nonDuplicates = remote.filter(r => !localIds.has(r.id));
          allMatches = [...localMatches, ...nonDuplicates];
        }
      }
      deliverySearchResults = allMatches;
      if (allMatches.length === 1 && !report.deliveryChecklistId) {
        applyDelivery(allMatches[0]);
      } else if (allMatches.length > 1) {
        deliveryPickerOpen = true;
      } else if (allMatches.length === 0) {
        deliverySearchError = `Nenhuma vistoria de entrega encontrada para a placa ${clean}.`;
      }
    } catch {
      deliverySearchError = "Não foi possível buscar as entregas. Verifique sua conexão.";
    } finally {
      searchingDelivery = false;
    }
  }
  function captureDiagram() {
    const image = diagram?.capture?.();
    if (image) {
      revokeMediaPreview(report.carDiagramImage);
      report.carDiagramImage = image;
    }
  }
  async function focusError() {
    await tick();
    formRoot?.querySelector('[aria-invalid="true"], [data-invalid="true"]')?.focus();
  }
  async function persist() {
    if (!eligible) {
      errors = inspectionErrors(report, 1);
      step = 1;
      await focusError();
      return false;
    }
    captureDiagram();
    try {
      await writer.flush(snapshot());
      return true;
    } catch {
      return false;
    }
  }
  async function navigateStep(next) {
    if (busy || processing || !hydrated || next === step) return;
    errors = next > step ? inspectionErrors(report, next - 1) : {};
    if (Object.keys(errors).length) {
      step = firstErrorStep(errors);
      await focusError();
      return;
    }
    busy = true;
    try {
      if (await persist()) {
        step = next;
        await tick();
        document.getElementById("step-title")?.focus();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    } finally {
      busy = false;
    }
  }
  async function leave(target = "/dashboard") {
    if (busy || processing) return;
    if (!hydrated) {
      allowLeave = true;
      await goto(target);
      return;
    }
    if (!eligible) {
      if (report.licensePlate || report.clientName) {
        leaveTarget = target;
        discardOpen = true;
        return;
      }
      allowLeave = true;
      await goto(target);
      return;
    }
    busy = true;
    try {
      if (await persist()) {
        allowLeave = true;
        await goto(target);
      }
    } finally {
      busy = false;
    }
  }
  beforeNavigate(navigation => {
    if (allowLeave || !hydrated) return;
    if (navigation.willUnload) {
      if (
        saveState === "saving" ||
        saveState === "unsaved" ||
        saveState === "error" ||
        (!eligible && (report.licensePlate || report.clientName))
      )
        navigation.cancel();
      return;
    }
    if (navigation.to?.url.href !== page.url.href) {
      navigation.cancel();
      leave(navigation.to?.url.href || "/dashboard");
    }
  });
  async function complete() {
    if (busy || processing) return;
    errors = inspectionErrors(report, 4);
    if (Object.keys(errors).length) {
      step = firstErrorStep(errors);
      await focusError();
      return;
    }
    busy = true;
    try {
      captureDiagram();
      await writer.complete(snapshot("completed"));
      allowLeave = true;
      await goto(`/dashboard?completed=${encodeURIComponent(report.id)}`);
    } catch {
      /* The writer exposes a persistent, retryable error. */
    } finally {
      busy = false;
    }
  }
  async function uploadLicense(event) {
    const file = event.target.files?.[0];
    if (!file || processing) return;
    processing = true;
    photoError = "";
    try {
      const image = await compressImage(file, {
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.85,
      });
      if (!alive) return;
      revokeMediaPreview(report.clientLicensePhoto);
      report.clientLicensePhoto = image;
      errors = { ...errors, clientLicensePhoto: "" };
    } catch (error) {
      photoError = error?.message || "Não foi possível preparar a foto. Tente outra imagem.";
    } finally {
      processing = false;
      event.target.value = "";
    }
  }
  onMount(() => {
    alive = true;
    writer = createInspectionWriter(saveInspection, (state, error) => {
      saveState = state;
      saveError =
        state === "error"
          ? error?.message ||
            "Não foi possível salvar. Mantenha esta página aberta e tente novamente."
          : "";
    });
    ui.saveAndExit = () => leave();
    const initialize = async () => {
      const now = new Date();
      report.inspectionDateTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      report.ownerUid = authState.user.uid;
      report.inspectorName = authState.displayName;
      const draftId = page.url.searchParams.get("id");
      if (draftId) {
        try {
          const draft = await getInspection(authState.user.uid, draftId);
          if (!draft) {
            loadError = "Este rascunho não está disponível neste dispositivo.";
            return;
          }
          if (draft.status !== "draft") {
            allowLeave = true;
            await goto(`/dashboard/new/${encodeURIComponent(draftId)}`);
            return;
          }
          if (!alive) return;
          report = {
            ...report,
            ...draft,
            mileage: formatMileage(draft.mileage),
          };
          saveState = "saved";
        } catch {
          loadError = "Não foi possível abrir o rascunho. Volte ao início e tente novamente.";
          return;
        }
      } else {
        const typeParam = page.url.searchParams.get("type");
        const deliveryIdParam = page.url.searchParams.get("deliveryId");
        const plateParam = page.url.searchParams.get("plate");
        if (typeParam === "Devolucao" || typeParam === "Devolução") {
          report.inspectionType = "Devolução";
        }
        if (plateParam) {
          report.licensePlate = plateParam
            .replace(/[^a-zA-Z0-9]/g, "")
            .toUpperCase()
            .slice(0, 7);
        }
        if (deliveryIdParam) {
          report.inspectionType = "Devolução";
          try {
            let delivery = await getInspection(authState.user.uid, deliveryIdParam).catch(
              () => null,
            );
            if (!delivery) {
              const snap = await getDoc(doc(db, "checklists", deliveryIdParam));
              if (snap.exists()) {
                delivery = normalizeCloudInspection(snap.data(), snap.id);
              }
            }
            if (delivery) {
              report.licensePlate = delivery.licensePlate || report.licensePlate;
              applyDelivery(delivery);
            }
          } catch (e) {
            console.warn("Could not load delivery inspection:", e);
          }
        } else if (report.inspectionType === "Devolução" && report.licensePlate.length === 7) {
          searchDelivery(report.licensePlate);
        }
      }
      if (!alive) return;
      hydrated = true;
      requestPersistentStorage().catch(() => false);
      getStorageEstimate()
        .then(estimate => {
          if (alive && estimate?.ratio > 0.85)
            storageWarning =
              "O armazenamento deste dispositivo está quase cheio. Sincronize suas vistorias antes de continuar.";
        })
        .catch(() => {});
    };
    initialize();
    const flush = () => {
      if (hydrated && eligible && !allowLeave) writer.flush(snapshot()).catch(() => {});
    };
    const hidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      alive = false;
      writer.dispose();
      ui.saveAndExit = null;
      ui.inspectionBusy = false;
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
      revokeMediaPreview(report.clientLicensePhoto);
      revokeMediaPreview(report.carDiagramImage);
    };
  });
  $effect(() => {
    const current = $state.snapshot(report);
    if (!hydrated || allowLeave) return;
    if (current.licensePlate.length === 7 && current.clientName.trim()) {
      writer?.schedule(() => (eligible ? snapshot() : null));
    } else {
      writer?.cancelScheduled();
      saveState = current.licensePlate || current.clientName ? "unsaved" : "idle";
    }
  });

  $effect(() => {
    ui.inspectionBusy = busy || processing || !!activePart;
  });
  $effect(() => {
    const currentErrors = inspectionErrors(report, 4);
    const remaining = Object.fromEntries(
      Object.entries(errors).filter(([key, message]) => message && currentErrors[key]),
    );
    if (Object.keys(remaining).length !== Object.keys(errors).length) errors = remaining;
  });
</script>

<svelte:head
  ><title
    >{page.url.searchParams.has("id") ? "Continuar vistoria" : "Nova vistoria"} · Checklist Alug</title
  ></svelte:head
>
<main class="page narrow inspection-form" bind:this={formRoot}>
  <div class="page-heading">
    <div>
      <div class="eyebrow">
        {report.licensePlate || "Checklist de veículos"}
      </div>
      <h1>
        {page.url.searchParams.has("id") ? "Continuar vistoria" : "Nova vistoria"}
      </h1>
    </div>
    <span class="badge">Etapa {step} de 4</span>
  </div>
  {#if loadError}<Notice message={loadError} /><a class="btn section" href="/dashboard"
      >Voltar ao início</a
    >
  {:else if !hydrated}<div class="loading-page" role="status">
      <span class="spinner"></span>Preparando vistoria…
    </div>
  {:else}
    <nav class="stepper" aria-label="Etapas da vistoria">
      {#each steps as label, index (label)}<button
          disabled={busy || processing}
          aria-current={step === index + 1 ? "step" : undefined}
          onclick={() => navigateStep(index + 1)}
          ><span class="step-number">{index + 1}</span>{label}</button
        >{/each}
    </nav>
    <div class="stack">
      <Notice message={storageWarning} type="info" /><Notice
        message={saveError}
        onretry={() => persist()}
      />
      <fieldset class="panel panel-pad" disabled={busy || processing}>
        <div class="form-section-title">
          <h2 id="step-title" tabindex="-1">{steps[step - 1]}</h2>
          <p>
            {step === 1
              ? "Identifique o veículo e o cliente."
              : step === 2
                ? "Registre as condições de entrega ou devolução."
                : step === 3
                  ? "Selecione uma peça para registrar danos e fotos."
                  : "Confira os dados e peça a assinatura do cliente."}
          </p>
        </div>
        {#if step === 1}
          <div class="form-grid">
            <div class="field span-two">
              <span class="field-label" id="type-label">Tipo de vistoria</span>
              <div class="segmented" aria-labelledby="type-label">
                {#each ["Entrega", "Devolução"] as type (type)}<button
                    type="button"
                    aria-pressed={report.inspectionType === type}
                    onclick={() => {
                      report.inspectionType = type;
                      if (
                        type === "Devolução" &&
                        report.licensePlate.length === 7 &&
                        !report.deliveryChecklistId
                      ) {
                        searchDelivery(report.licensePlate);
                      }
                    }}>{type}</button
                  >{/each}
              </div>
            </div>
            {#if report.inspectionType === "Devolução"}
              <div class="field span-two">
                {#if report.deliverySnapshot}
                  <div class="panel panel-pad" style="background:#f0fdf4;border-color:#bbf7d0">
                    <div class="section-heading" style="margin-bottom:4px">
                      <div>
                        <span
                          class="badge"
                          style="background:#dcfce7;color:#15803d;border-color:#86efac;font-weight:600"
                          >Vistoria de Entrega Vinculada</span
                        >
                        <h4 style="margin:6px 0 2px;font-size:1.05rem">
                          {formatInspectionDateTime(report.deliverySnapshot.inspectionDateTime)}
                        </h4>
                        <p class="muted" style="margin:0;font-size:0.875rem">
                          Inspetor: {report.deliverySnapshot.inspectorName || "N/A"} · Km na entrega:
                          {report.deliverySnapshot.mileage
                            ? report.deliverySnapshot.mileage + " km"
                            : "Não informada"} · Combustível: {report.deliverySnapshot.fuelLevel ||
                            "4/8"}
                        </p>
                      </div>
                      <div class="inline" style="gap:8px">
                        <button
                          type="button"
                          class="btn"
                          onclick={() => (deliveryPickerOpen = true)}
                        >
                          Trocar entrega
                        </button>
                        <button type="button" class="text-action" onclick={clearDelivery}>
                          Desvincular
                        </button>
                      </div>
                    </div>
                  </div>
                {:else}
                  <div class="panel panel-pad" style="background:#f8fafc;border:1px dashed #cbd5e1">
                    <div class="section-heading">
                      <div>
                        <strong style="display:block;margin-bottom:2px"
                          >Buscar Vistoria de Entrega</strong
                        >
                        <p class="muted" style="margin:0;font-size:0.875rem">
                          {searchingDelivery
                            ? "Buscando vistorias de entrega para esta placa…"
                            : report.licensePlate.length === 7
                              ? "Vincule a vistoria de entrega para pré-preencher danos e dados do cliente."
                              : "Preencha a placa com 7 caracteres para localizar a entrega anterior."}
                        </p>
                      </div>
                      {#if report.licensePlate.length === 7}
                        <button
                          type="button"
                          class="btn"
                          disabled={searchingDelivery}
                          onclick={() => searchDelivery(report.licensePlate)}
                        >
                          <Icon name="search" size={16} />{searchingDelivery
                            ? "Buscando…"
                            : "Buscar entrega"}
                        </button>
                      {/if}
                    </div>
                    {#if deliverySearchError}
                      <div style="margin-top:10px">
                        <Notice message={deliverySearchError} />
                      </div>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="field">
              <label for="plate">Placa do veículo *</label><input
                id="plate"
                bind:value={report.licensePlate}
                oninput={e => {
                  const cleaned = e.target.value
                    .replace(/[^a-zA-Z0-9]/g, "")
                    .toUpperCase()
                    .slice(0, 7);
                  report.licensePlate = cleaned;
                  if (
                    report.inspectionType === "Devolução" &&
                    cleaned.length === 7 &&
                    !report.deliveryChecklistId
                  ) {
                    searchDelivery(cleaned);
                  }
                }}
                maxlength="7"
                autocomplete="off"
                autocapitalize="characters"
                spellcheck="false"
                placeholder="ABC1D23"
                aria-invalid={!!errors.licensePlate}
                aria-describedby="plate-error"
              /><span id="plate-error" class="field-error">{errors.licensePlate || ""}</span>
            </div>
            <div class="field">
              <label for="client">Nome do cliente *</label><input
                id="client"
                bind:value={report.clientName}
                maxlength="200"
                autocomplete="name"
                placeholder="Nome completo"
                aria-invalid={!!errors.clientName}
                aria-describedby="client-error"
              /><span id="client-error" class="field-error">{errors.clientName || ""}</span>
            </div>
            <div class="field">
              <label for="inspector">Inspetor *</label><input
                id="inspector"
                bind:value={report.inspectorName}
                maxlength="120"
                aria-invalid={!!errors.inspectorName}
                aria-describedby="inspector-error"
              /><span id="inspector-error" class="field-error">{errors.inspectorName || ""}</span>
            </div>
            <div class="field">
              <label for="date">Data e hora *</label><input
                id="date"
                type="datetime-local"
                bind:value={report.inspectionDateTime}
                aria-invalid={!!errors.inspectionDateTime}
                aria-describedby="date-error"
              /><span id="date-error" class="field-error">{errors.inspectionDateTime || ""}</span>
            </div>
          </div>
        {:else if step === 2}
          <div class="stack">
            <div class="field">
              <label for="mileage">Quilometragem (km) *</label><input
                id="mileage"
                inputmode="numeric"
                bind:value={report.mileage}
                oninput={e => (report.mileage = formatMileage(e.target.value).slice(0, 20))}
                placeholder="45.000"
                aria-invalid={!!errors.mileage}
                aria-describedby="mileage-error"
              />
              {#if report.deliverySnapshot?.mileage}
                <span class="field-help" style="margin-top:4px">
                  Km na entrega: <strong>{report.deliverySnapshot.mileage} km</strong>
                  {#if mileageDiff && !mileageDiff.isNegative}
                    · ({mileageDiff.formatted} km rodados)
                  {/if}
                </span>
              {/if}
              <span id="mileage-error" class="field-error">{errors.mileage || ""}</span>
            </div>
            <div class="field">
              <span class="field-label" id="fuel-label">Combustível</span>
              <div class="choice-grid" aria-labelledby="fuel-label">
                {#each ["0/8", "1/8", "2/8", "3/8", "4/8", "5/8", "6/8", "7/8", "8/8"] as level (level)}<button
                    type="button"
                    aria-pressed={report.fuelLevel === level}
                    onclick={() => (report.fuelLevel = level)}
                    >{level === "0/8"
                      ? "Vazio"
                      : level === "4/8"
                        ? "Meio · 4/8"
                        : level === "8/8"
                          ? "Cheio"
                          : level}</button
                  >{/each}
              </div>
              {#if report.deliverySnapshot?.fuelLevel}
                <span class="field-help" style="margin-top:6px">
                  Nível na entrega: <strong>{report.deliverySnapshot.fuelLevel}</strong>
                  {#if fuelDiff}
                    · ({fuelDiff.text})
                  {/if}
                </span>
              {/if}
            </div>
            <div>
              <h3>Itens presentes</h3>
              <label class="check-row" for="document"
                >Documento do veículo<input
                  id="document"
                  type="checkbox"
                  bind:checked={report.hasDocument}
                /></label
              ><label class="check-row" for="seat"
                >Cadeirinha infantil<input
                  id="seat"
                  type="checkbox"
                  bind:checked={report.hasChildSeat}
                /></label
              ><label class="check-row" for="toll"
                >Tag de pedágio<input
                  id="toll"
                  type="checkbox"
                  bind:checked={report.hasEToll}
                /></label
              >
            </div>
          </div>
        {:else if step === 3}
          <div class="stack">
            <div class="section-heading">
              <div class="segmented">
                <button aria-pressed={damageView === "map"} onclick={() => (damageView = "map")}
                  >Mapa</button
                ><button aria-pressed={damageView === "list"} onclick={() => (damageView = "list")}
                  >Lista de peças</button
                >
              </div>
              <span class="muted">{photoCount}/24 fotos</span>
            </div>
            <Notice message={errors.partStates || ""} />
            <div hidden={damageView !== "map"}>
              <CarDiagram bind:this={diagram} bind:activePart partStates={report.partStates} />
            </div>
            {#if damageView === "list"}<div>
                {#each Object.entries(PART_NAMES) as [partId, name] (partId)}<button
                    class="check-row"
                    style="width:100%;text-align:left"
                    onclick={() => (activePart = partId)}
                    ><span>{name}</span>
                    <div class="inline" style="gap:6px">
                      {#if report.partStates[partId]?.isNewDamage}
                        <span class="badge danger">Novo</span>
                      {:else if report.partStates[partId]?.deliveryStatus}
                        <span class="badge">Pré-existente</span>
                      {/if}
                      <span class="badge"
                        >{STATUS_LABELS[report.partStates[partId]?.status] || "Sem danos"}</span
                      >
                    </div>
                    <Icon name="chevron" size={16} /></button
                  >{/each}
              </div>{/if}
            <p class="field-help">
              {#if report.inspectionType === "Devolução" && report.deliverySnapshot}
                {newDamages.length}
                {newDamages.length === 1 ? "nova avaria" : "novas avarias"} detectadas ({countDamages(
                  report.partStates,
                )} avarias no total). Se não houver novos danos, continue para a conclusão.
              {:else}
                {countDamages(report.partStates)} danos registrados. Se não houver danos, continue para
                a conclusão.
              {/if}
            </p>
          </div>
        {:else}
          <div class="stack">
            {#if report.inspectionType === "Devolução" && report.deliverySnapshot}
              <div
                class="panel panel-pad"
                style="background:{newDamages.length
                  ? '#fef2f2'
                  : '#f0fdf4'};border-color:{newDamages.length ? '#fecaca' : '#bbf7d0'}"
              >
                <div class="section-heading" style="margin-bottom:6px">
                  <h4 style="margin:0;color:{newDamages.length ? '#b91c1c' : '#15803d'}">
                    {newDamages.length
                      ? `Atenção: ${newDamages.length} ${newDamages.length === 1 ? "nova avaria registrada" : "novas avarias registradas"}`
                      : "Tudo em ordem: sem novas avarias"}
                  </h4>
                  <span class="badge {newDamages.length ? 'danger' : 'success'}">
                    {newDamages.length ? "Avarias no retorno" : "Mesmo estado"}
                  </span>
                </div>
                <p class="muted" style="font-size:0.875rem;margin:0 0 8px">
                  {newDamages.length
                    ? "Revise os novos danos detectados com o cliente antes de coletar a assinatura."
                    : "O veículo foi inspecionado e não possui avarias adicionais em relação à entrega."}
                </p>
                {#if newDamages.length > 0}
                  <ul style="margin:0;padding-left:18px;font-size:0.875rem;color:#991b1b">
                    {#each newDamages as d (d.partId)}
                      <li>
                        <strong>{d.partName}</strong>: {STATUS_LABELS[d.status] || d.status}
                        {#if d.comments}
                          — "{d.comments}"{/if}
                        {#if d.isWorsened}
                          <em
                            >(Na entrega: {STATUS_LABELS[d.previousStatus] || d.previousStatus})</em
                          >
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {/if}
                {#if mileageDiff || fuelDiff}
                  <div class="inline" style="gap:12px;margin-top:8px;font-size:0.875rem">
                    {#if mileageDiff}
                      <span
                        ><strong>Uso:</strong>
                        {mileageDiff.isNegative
                          ? "Hodômetro menor"
                          : `${mileageDiff.formatted} km rodados`}</span
                      >
                    {/if}
                    {#if fuelDiff}
                      <span><strong>Combustível:</strong> {fuelDiff.text}</span>
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
            <div class="panel panel-pad" style="background:#f7f9f7">
              <div class="section-heading">
                <h3>Resumo da vistoria</h3>
                <button class="text-action" onclick={() => navigateStep(1)}
                  >Editar dados<Icon name="edit" size={15} /></button
                >
              </div>
              <dl class="review-grid">
                <div>
                  <dt>Placa</dt>
                  <dd class="plate">{report.licensePlate}</dd>
                </div>
                <div>
                  <dt>Tipo</dt>
                  <dd>{report.inspectionType}</dd>
                </div>
                <div>
                  <dt>Cliente</dt>
                  <dd>{report.clientName}</dd>
                </div>
                <div>
                  <dt>Inspetor</dt>
                  <dd>{report.inspectorName}</dd>
                </div>
                <div>
                  <dt>Quilometragem</dt>
                  <dd>{report.mileage} km</dd>
                </div>
                <div>
                  <dt>Combustível</dt>
                  <dd>{report.fuelLevel}</dd>
                </div>
              </dl>
              <div class="inline" style="margin-top:16px">
                <button class="text-action" onclick={() => navigateStep(2)}>Editar interior</button
                ><button class="text-action" onclick={() => navigateStep(3)}
                  >Revisar {countDamages(report.partStates)} danos</button
                >
              </div>
            </div>
            <div class="field">
              <span class="field-label" id="license-label">Foto da CNH *</span><Notice
                message={photoError}
              />
              {#if report.clientLicensePhoto}<img
                  class="upload-preview"
                  src={mediaPreviewUrl(report.clientLicensePhoto)}
                  alt="CNH do cliente"
                />{/if}
              {#if report.deliverySnapshot?.clientLicensePhoto && report.clientLicensePhoto === report.deliverySnapshot.clientLicensePhoto}
                <p class="field-help" style="color:#15803d">
                  Foto da CNH reutilizada da entrega. Clique em "Refazer foto" ou "Galeria" se for
                  outro condutor.
                </p>
              {/if}
              <div class="upload-controls">
                <button
                  class="btn"
                  aria-labelledby="license-label camera-label"
                  data-invalid={!!errors.clientLicensePhoto}
                  aria-describedby="license-error"
                  onclick={() => cameraInput.click()}
                  ><Icon name="camera" /><span id="camera-label"
                    >{processing
                      ? "Preparando…"
                      : report.clientLicensePhoto
                        ? "Refazer foto"
                        : "Tirar foto"}</span
                  ></button
                ><button class="btn" onclick={() => galleryInput.click()}
                  ><Icon name="image" />Galeria</button
                >
              </div>
              <input
                class="sr-only"
                tabindex="-1"
                type="file"
                accept="image/*"
                capture="environment"
                bind:this={cameraInput}
                onchange={uploadLicense}
                aria-label="Capturar CNH"
              /><input
                class="sr-only"
                tabindex="-1"
                type="file"
                accept="image/*"
                bind:this={galleryInput}
                onchange={uploadLicense}
                aria-label="Escolher CNH da galeria"
              /><span id="license-error" class="field-error">{errors.clientLicensePhoto || ""}</span
              >
            </div>
            <div class="field">
              <span class="field-label">Assinatura do cliente *</span><SignaturePad
                bind:signature={report.clientSignature}
                invalid={!!errors.clientSignature}
              /><span class="field-error">{errors.clientSignature || ""}</span>
            </div>
          </div>
        {/if}
      </fieldset>
    </div>
    <div class="inspection-actions">
      <div>
        <button
          class="btn"
          disabled={busy || processing}
          onclick={() => (step === 1 ? leave() : navigateStep(step - 1))}
          ><Icon name="back" size={17} />{step === 1 ? "Sair" : "Voltar"}</button
        ><span class="save-state" class:error={saveState === "error"} role="status"
          >{saveState === "saving"
            ? "Salvando…"
            : saveState === "saved"
              ? "Salvo neste dispositivo"
              : saveState === "error"
                ? "Falha ao salvar — tente novamente"
                : eligible
                  ? "Alterações pendentes"
                  : "Preencha placa e cliente para salvar"}</span
        ><button
          class="btn primary"
          disabled={busy || processing}
          onclick={() => (step === 4 ? complete() : navigateStep(step + 1))}
          >{busy ? "Salvando…" : step === 4 ? "Concluir vistoria" : "Continuar"}<Icon
            name={step === 4 ? "check" : "arrow"}
            size={17}
          /></button
        >
      </div>
    </div>
  {/if}
</main>
{#if activePart}<DamageModal
    bind:partId={activePart}
    bind:partStates={report.partStates}
    partName={PART_NAMES[activePart]}
  />{/if}
{#if discardOpen}<Dialog title="Sair sem salvar?" onclose={() => (discardOpen = false)}
    ><p>
      Preencha a placa e o nome do cliente para salvar o rascunho. Se sair agora, estes dados serão
      perdidos.
    </p>
    {#snippet footer()}<button class="btn" onclick={() => (discardOpen = false)}
        >Continuar editando</button
      ><button
        class="btn danger"
        onclick={async () => {
          allowLeave = true;
          discardOpen = false;
          await goto(leaveTarget || "/dashboard");
        }}>Descartar e sair</button
      >{/snippet}</Dialog
  >{/if}
{#if deliveryPickerOpen}<Dialog
    title="Selecionar Vistoria de Entrega"
    onclose={() => (deliveryPickerOpen = false)}
    wide
  >
    <div class="stack">
      <p class="muted">
        Selecione a entrega correspondente para a placa <strong>{report.licensePlate}</strong>:
      </p>
      {#if deliverySearchResults.length}
        <div class="panel inspection-list">
          {#each deliverySearchResults as item (item.id)}
            <button
              type="button"
              class="check-row"
              style="width:100%;text-align:left;padding:12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between"
              onclick={() => applyDelivery(item)}
            >
              <div style="flex:1">
                <div class="inline" style="gap:8px;margin-bottom:4px">
                  <strong>{formatInspectionDateTime(item.inspectionDateTime)}</strong>
                  <span class="badge">{item.inspectorName || "Inspetor"}</span>
                </div>
                <p class="muted" style="font-size:0.875rem;margin:0">
                  Cliente: {item.clientName} · Km: {item.mileage || "Não inf."} · Combustível: {item.fuelLevel ||
                    "4/8"}
                </p>
              </div>
              <span class="btn" style="pointer-events:none;margin-left:12px">Selecionar</span>
            </button>
          {/each}
        </div>
      {:else}
        <p class="muted">Nenhuma entrega encontrada para esta placa.</p>
      {/if}
    </div>
    {#snippet footer()}
      <button class="btn" onclick={() => (deliveryPickerOpen = false)}>Fechar</button>
    {/snippet}
  </Dialog>
{/if}
