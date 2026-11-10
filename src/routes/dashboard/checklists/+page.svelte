<script>
  import { onMount } from "svelte";
  import { db } from "$lib/firebaseDb.js";
  import {
    collection,
    getDocs,
    query,
    orderBy,
    limit,
    startAfter,
    where,
  } from "firebase/firestore";
  import { authState } from "$lib/auth.svelte.js";
  import { normalizeCloudInspection } from "$lib/inspection.js";
  import { normalizePlate } from '$lib/cars.js';
  import Notice from "$lib/components/Notice.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InspectionRow from "$lib/components/InspectionRow.svelte";
  let records = $state([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state("");
  let offline = $state(false);
  let lastDocument = null;
  let hasMore = $state(true);
  let plate = $state('');
  let plateError = $state('');
  let selectedPlate = $state('');
  let type = $state("All");
  let request = 0;
  let filtered = $derived(
    records.filter(
      record => type === "All" || record.inspectionType === type,
    ),
  );
  async function load(append = false) {
    if (append && (loading || loadingMore || !hasMore)) return;
    const token = ++request;
    const filterPlate = selectedPlate;
    error = "";
    if (append) loadingMore = true;
    else {
      loading = true;
      loadingMore = false;
      records = [];
      lastDocument = null;
      hasMore = true;
    }
    try {
      if (offline) throw new Error("offline");
      const constraints = [];
      if (!authState.hasPermission("administrator", "read"))
        constraints.push(where("ownerUid", "==", authState.user.uid));
      if (filterPlate) {
        // Equality filters use the existing single-field indexes. Sort only this
        // plate's summaries locally to avoid requiring a new composite index.
        constraints.push(where('licensePlate', '==', filterPlate));
      } else {
        constraints.push(orderBy("inspectionDateTime", "desc"), limit(20));
        if (append && lastDocument) constraints.push(startAfter(lastDocument));
      }
      const snapshot = await getDocs(query(collection(db, "checklist_summaries"), ...constraints));
      if (token !== request) return;
      const incoming = snapshot.docs.map(doc => ({
        ...normalizeCloudInspection(doc.data(), doc.id),
        synced: true,
      }));
      if (filterPlate) incoming.sort((a, b) =>
        (new Date(b.inspectionDateTime || b.createdAt || 0).getTime() || 0) -
        (new Date(a.inspectionDateTime || a.createdAt || 0).getTime() || 0)
      );
      records = append ? [...records, ...incoming] : incoming;
      lastDocument = snapshot.docs.at(-1) || null;
      hasMore = !filterPlate && snapshot.size === 20;
    } catch {
      if (token === request)
        error =
          offline
            ? "Sem conexão para consultar o histórico. Rascunhos e vistorias aguardando envio estão no Início."
            : "Não foi possível carregar o histórico. Tente novamente.";
    } finally {
      if (token === request) {
        loading = false;
        loadingMore = false;
      }
    }
  }
  function searchPlate(event) {
    event.preventDefault();
    const normalized = normalizePlate(plate);
    if (normalized.length !== 7) {
      plateError = 'Informe os 7 caracteres da placa.';
      return;
    }
    plate = normalized;
    selectedPlate = normalized;
    load();
  }
  function clearPlate() {
    const wasFiltered = !!selectedPlate;
    plate = '';
    plateError = '';
    selectedPlate = '';
    if (wasFiltered) load();
  }
  onMount(() => {
    offline = !navigator.onLine;
    load();
    const online = () => {
      offline = false;
      if (error) load();
    };
    const disconnected = () => (offline = true);
    window.addEventListener("online", online);
    window.addEventListener("offline", disconnected);
    return () => {
      request++;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", disconnected);
    };
  });
</script>

<svelte:head><title>Histórico · Checklist Alug</title></svelte:head>
<main class="page">
  <div class="page-heading">
    <div>
      <div class="eyebrow">Registro de vistorias</div>
      <h1>Histórico</h1>
      <p>Encontre uma vistoria, consulte os detalhes e envie o laudo por e-mail.</p>
    </div>
  </div>
  <div class="toolbar section">
    <form class="field history-plate" role="search" onsubmit={searchPlate}>
      <label for="history-plate">Placa do veículo</label>
      <div class="plate-search">
        <input
          id="history-plate"
          type="search"
          placeholder="ABC1D23"
          maxlength="8"
          autocapitalize="characters"
          autocomplete="off"
          spellcheck="false"
          aria-invalid={!!plateError}
          aria-describedby={plateError ? 'history-plate-error' : undefined}
          bind:value={plate}
          oninput={() => (plateError = '')}
        />
        <button class="btn primary" type="submit">Buscar</button>
      </div>
      {#if plateError}<span id="history-plate-error" class="field-error" role="alert">{plateError}</span>{/if}
    </form>
    <div class="field history-type">
      <label for="history-type">Tipo de vistoria</label>
      <select id="history-type" bind:value={type}
      >
        <option value="All">Todos os tipos</option>
        <option>Entrega</option>
        <option>Devolução</option>
        <option>Interno</option>
      </select>
    </div>
  </div>
  <Notice message={error} onretry={() => load()} />
  <div class="section-heading">
    <span class="muted">
      {#if !loading}
        {filtered.length} {filtered.length === 1 ? "vistoria encontrada" : "vistorias encontradas"}
        entre {records.length} carregadas{selectedPlate ? ` para ${selectedPlate}` : ''}
      {/if}
    </span>
    {#if plate || plateError || selectedPlate || type !== "All"}
      <button class="text-action" onclick={() => {
        clearPlate();
        type = "All";
      }}>Limpar filtros</button>
    {/if}
  </div>
  {#if loading}<div class="panel" role="status" aria-label="Carregando histórico">
      {#each [1, 2, 3] as i (i)}<div class="skeleton"></div>{/each}
    </div>
  {:else}
    {#if filtered.length}<div class="panel inspection-list">
        {#each filtered as record (record.id)}<InspectionRow
            inspection={record}
            href={`/dashboard/checklists/${encodeURIComponent(record.id)}`}
          />{/each}
      </div>
    {:else if !error}<EmptyState
        title={selectedPlate || type !== "All"
          ? "Nenhuma vistoria encontrada"
          : "Seu histórico começa aqui"}
        description={selectedPlate || type !== "All"
          ? "Tente outra placa ou tipo de vistoria."
          : "As vistorias enviadas aparecerão aqui."}
      />{/if}
    {#if hasMore && !offline}<div
        class="inline section"
        style="justify-content:center"
      >
        <button class="btn" disabled={loadingMore} onclick={() => load(true)}
          >{loadingMore ? "Carregando…" : "Carregar mais vistorias"}</button
        >
      </div>{/if}
  {/if}
</main>

<style>
  .toolbar { align-items: flex-start; }
  .history-plate { flex: 1; min-width: 0; }
  .plate-search { display: flex; gap: 8px; }
  .plate-search input { min-width: 0; }
  @media (max-width: 699px) {
    .history-plate { flex-basis: 100%; }
    .history-type { width: 100%; }
  }
</style>
