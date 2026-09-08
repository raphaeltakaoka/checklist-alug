<script>
  import { onMount } from "svelte";
  import { page } from "$app/state";
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
  import { getAllInspections } from "$lib/db.js";
  import { authState } from "$lib/auth.svelte.js";
  import { normalizeCloudInspection } from "$lib/inspection.js";
  import Icon from "$lib/components/Icon.svelte";
  import Notice from "$lib/components/Notice.svelte";
  import EmptyState from "$lib/components/EmptyState.svelte";
  import InspectionRow from "$lib/components/InspectionRow.svelte";
  let source = $state("cloud");
  let cloud = $state([]);
  let local = $state([]);
  let loading = $state(true);
  let loadingMore = $state(false);
  let error = $state("");
  let offline = $state(false);
  let lastDocument = null;
  let hasMore = $state(true);
  let search = $state("");
  let type = $state("All");
  let request = 0;
  let records = $derived(source === "cloud" ? cloud : local);
  let filtered = $derived(
    records.filter(
      record =>
        `${record.licensePlate} ${record.clientName}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()) &&
        (type === "All" || record.inspectionType === type),
    ),
  );
  async function load(append = false) {
    if (append && (loadingMore || !hasMore)) return;
    const token = ++request;
    error = "";
    if (append) loadingMore = true;
    else loading = true;
    try {
      if (source === "local") {
        local = await getAllInspections(authState.user.uid);
        return;
      }
      if (offline) throw new Error("offline");
      const constraints = [];
      if (!authState.hasPermission("administrator", "read"))
        constraints.push(where("ownerUid", "==", authState.user.uid));
      constraints.push(orderBy("inspectionDateTime", "desc"), limit(20));
      if (append && lastDocument) constraints.push(startAfter(lastDocument));
      const snapshot = await getDocs(query(collection(db, "checklist_summaries"), ...constraints));
      if (token !== request) return;
      const incoming = snapshot.docs.map(doc => ({
        ...normalizeCloudInspection(doc.data(), doc.id),
        synced: true,
      }));
      cloud = append ? [...cloud, ...incoming] : incoming;
      lastDocument = snapshot.docs.at(-1) || null;
      hasMore = snapshot.size === 20;
    } catch {
      if (token === request)
        error =
          source === "local"
            ? "Não foi possível abrir o histórico deste dispositivo."
            : offline
              ? "Sem conexão para consultar as vistorias sincronizadas. Abra “Neste dispositivo” para ver os registros disponíveis offline."
              : "Não foi possível carregar o histórico. Tente novamente.";
    } finally {
      if (token === request) {
        loading = false;
        loadingMore = false;
      }
    }
  }
  function changeSource(next) {
    if (source === next) return;
    source = next;
    load();
  }
  onMount(() => {
    offline = !navigator.onLine;
    if (offline || page.url.searchParams.get("source") === "local") source = "local";
    load();
    const update = () => (offline = !navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      request++;
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  });
</script>

<svelte:head><title>Histórico · Checklist Alug</title></svelte:head>
<main class="page">
  <div class="page-heading">
    <div>
      <div class="eyebrow">Registro de vistorias</div>
      <h1>Histórico</h1>
      <p>Encontre uma vistoria, consulte os detalhes e imprima o laudo.</p>
    </div>
  </div>
  <div class="segmented" aria-label="Origem do histórico">
    <button aria-pressed={source === "cloud"} onclick={() => changeSource("cloud")}
      >Sincronizadas</button
    ><button aria-pressed={source === "local"} onclick={() => changeSource("local")}
      >Neste dispositivo</button
    >
  </div>
  <div class="toolbar section">
    <div class="search">
      <Icon name="search" size={18} /><input
        type="search"
        bind:value={search}
        aria-label="Buscar no histórico carregado"
        placeholder="Buscar por placa ou cliente"
      />
    </div>
    <select bind:value={type} aria-label="Tipo de vistoria"
      ><option value="All">Todos os tipos</option><option>Entrega</option><option>Devolução</option
      ></select
    >
  </div>
  <Notice message={error} onretry={() => load()} />
  {#if loading}<div class="panel" role="status" aria-label="Carregando histórico">
      {#each [1, 2, 3] as i}<div class="skeleton"></div>{/each}
    </div>
  {:else}
    <div class="section-heading">
      <span class="muted"
        >{filtered.length}
        {filtered.length === 1 ? "vistoria encontrada" : "vistorias encontradas"}{source === "cloud"
          ? ` entre ${cloud.length} carregadas`
          : " neste dispositivo"}</span
      >{#if search || type !== "All"}<button
          class="text-action"
          onclick={() => {
            search = "";
            type = "All";
          }}>Limpar filtros</button
        >{/if}
    </div>
    {#if filtered.length}<div class="panel inspection-list">
        {#each filtered as record (record.id)}<InspectionRow
            inspection={record}
            href={source === "cloud"
              ? `/dashboard/checklists/${encodeURIComponent(record.id)}`
              : record.status === "draft"
                ? `/dashboard/new?id=${encodeURIComponent(record.id)}`
                : `/dashboard/new/${encodeURIComponent(record.id)}`}
          />{/each}
      </div>
    {:else if !error}<EmptyState
        title={search || type !== "All"
          ? "Nenhuma vistoria encontrada"
          : "Seu histórico começa aqui"}
        description={search || type !== "All"
          ? "Tente outra placa, cliente ou tipo de vistoria."
          : source === "local"
            ? "As vistorias salvas neste dispositivo aparecerão aqui."
            : "As vistorias enviadas aparecerão aqui."}
      />{/if}
    {#if source === "cloud" && hasMore && !offline}<div
        class="inline section"
        style="justify-content:center"
      >
        <button class="btn" disabled={loadingMore} onclick={() => load(true)}
          >{loadingMore ? "Carregando…" : "Carregar mais vistorias"}</button
        >
      </div>{/if}
  {/if}
</main>
