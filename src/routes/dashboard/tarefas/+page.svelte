<script>
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { db } from "$lib/firebaseDb.js";
  import { authState } from "$lib/auth.svelte.js";
  import {
    collectionGroup,
    getDocs,
    limit,
    orderBy,
    query,
    startAfter,
    where,
  } from "firebase/firestore";
  import { fade, fly } from "svelte/transition";
  import Navbar from "$lib/components/Navbar.svelte";
  import { safeAttachmentUrl } from '$lib/inspection.js';

  // Page states
  let tasks = $state([]);
  let projectTagsMap = $state({});
  let loading = $state(true);
  let errorMsg = $state("");
  let lastDocument = null;
  let hasMore = $state(true);
  let loadingMore = $state(false);

  // Filter and search states
  let searchQuery = $state("");
  let selectedColumn = $state("All");

  // Modal & Lightbox states
  let selectedTask = $state(null);
  let activeImagePreview = $state(null);

  onMount(async () => {
    // Force light theme to match app standard
    document.documentElement.classList.remove("dark");
    await fetchAssignedTasks();
  });

  async function fetchAssignedTasks({ append = false } = {}) {
    if (!authState.user) {
      loading = false;
      return;
    }
		if (append && (!hasMore || loadingMore)) return;

		if (append) loadingMore = true;
		else loading = true;
    errorMsg = "";

    try {
      const userId = authState.user.uid;
		const constraints = [
		  where('assignedUserId', '==', userId),
		  where('state', '==', 'active'),
		  orderBy('dueDateKey', 'asc'),
		  limit(50),
		];
		if (append && lastDocument) constraints.push(startAfter(lastDocument));
		const q = query(collectionGroup(db, 'cards'), ...constraints);
      const querySnapshot = await getDocs(q);

      let fetchedItems = [];
	  let tagsMapping = append ? { ...projectTagsMap } : {};

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
		if (Array.isArray(data.boardTags)) {
		  data.boardTags.forEach((tag) => {
			if (tag && tag.id) {
              tagsMapping[tag.id] = {
                name: tag.name || "Tag",
                color: tag.color || "#64748b",
              };
            }
          });
        }

		if ((data.columnName || '').trim().toLowerCase() !== 'monitorar') {
		  fetchedItems.push({
			...data,
			id: docSnap.id,
			projectId: data.boardId,
			projectTitle: data.boardTitle || 'Projeto',
		  });
		}
      });

      projectTagsMap = tagsMapping;
	  tasks = append ? [...tasks, ...fetchedItems] : fetchedItems;
	  lastDocument = querySnapshot.docs.at(-1) || lastDocument;
	  hasMore = querySnapshot.size === 50;
    } catch (e) {
      console.error("Erro ao carregar tarefas do Firestore:", e);
      errorMsg =
        "Ocorreu um erro ao carregar suas tarefas da nuvem. Verifique sua conexão.";
    } finally {
      loading = false;
	  loadingMore = false;
    }
  }

  // Unique list of available column status names (excluding 'Monitorar')
  const availableColumns = $derived([
    "All",
    ...Array.from(new Set(tasks.map((t) => t.columnName))).filter(
      (col) => col.trim().toLowerCase() !== "monitorar",
    ),
  ]);

  // Filtered tasks based on search & column filter, ordered by due date (sooner first)
  const filteredTasks = $derived(
    tasks
      .filter((task) => {
        const matchesSearch =
          (task.title || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase()) ||
          (task.description || "")
            .toLowerCase()
            .includes(searchQuery.toLowerCase());

        const matchesColumn =
          selectedColumn === "All" || task.columnName === selectedColumn;

        return matchesSearch && matchesColumn;
      })
      .sort((a, b) => {
        if (!a.dueDateTime && !b.dueDateTime) return 0;
        if (!a.dueDateTime) return 1;
        if (!b.dueDateTime) return -1;
        return (
          new Date(a.dueDateTime).getTime() - new Date(b.dueDateTime).getTime()
        );
      }),
  );

  // Calculate summary stats
  const stats = $derived({
    total: tasks.length,
    entregas: tasks.filter((t) =>
      t.columnName.toLowerCase().includes("entrega"),
    ).length,
    retiradas: tasks.filter((t) =>
      t.columnName.toLowerCase().includes("retirada"),
    ).length,
    outras: tasks.filter(
      (t) =>
        !t.columnName.toLowerCase().includes("entrega") &&
        !t.columnName.toLowerCase().includes("retirada"),
    ).length,
  });

  // Helper function to format due dates
  function formatDueDate(dateTimeStr) {
    if (!dateTimeStr) return null;
    try {
      const d = new Date(dateTimeStr);
      if (isNaN(d.getTime())) return dateTimeStr;

      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");

      return `${day}/${month}/${year} às ${hours}:${minutes}`;
    } catch {
      return dateTimeStr;
    }
  }

  // Helper to check if a due date is past
  function isOverdue(dateTimeStr) {
    if (!dateTimeStr) return false;
    const d = new Date(dateTimeStr);
    return !isNaN(d.getTime()) && d < new Date();
  }

  // Modal Controls
  function openTaskModal(task) {
    selectedTask = task;
    activeImagePreview = null;
  }

  function closeTaskModal() {
    selectedTask = null;
    activeImagePreview = null;
  }

  function openImagePreview(fileItem, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const url = getFileUrl(fileItem);
    console.log("Opening image preview URL:", url, "for file:", fileItem);
    if (url) {
      activeImagePreview = url;
    }
  }

  // File Handling Helpers
  function getFileUrl(fileItem) {
    if (!fileItem) return "";
	if (typeof fileItem === "string") return safeAttachmentUrl(fileItem);
	return safeAttachmentUrl(
      fileItem.url ||
      fileItem.downloadUrl ||
      fileItem.src ||
      fileItem.link ||
      fileItem.data ||
      fileItem.path ||
	  "",
	);
  }

  function getFileName(fileItem, index) {
    if (!fileItem) return `Arquivo ${index + 1}`;
    if (
      typeof fileItem === "object" &&
      (fileItem.name || fileItem.fileName || fileItem.title)
    ) {
      return fileItem.name || fileItem.fileName || fileItem.title;
    }
    const url = getFileUrl(fileItem);
    if (url.startsWith("data:image")) return `Imagem ${index + 1}`;
    try {
      const parsed = new URL(url);
      const pathname = parsed.pathname;
      const segments = pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last) return decodeURIComponent(last);
    } catch {
      // ignore URL parse errors
    }
    return `Arquivo ${index + 1}`;
  }

  function isImageFile(fileItem) {
    const url = getFileUrl(fileItem);
    if (!url) return false;
    if (url.startsWith("data:image/")) return true;
    if (
      typeof fileItem === "object" &&
      fileItem.type &&
      fileItem.type.startsWith("image/")
    )
      return true;

    const cleanUrl = url.split("?")[0].toLowerCase();
    return (
      cleanUrl.endsWith(".png") ||
      cleanUrl.endsWith(".jpg") ||
      cleanUrl.endsWith(".jpeg") ||
      cleanUrl.endsWith(".webp") ||
      cleanUrl.endsWith(".gif") ||
      cleanUrl.endsWith(".svg") ||
      cleanUrl.endsWith(".bmp") ||
      cleanUrl.includes("firebasestorage") ||
      cleanUrl.includes("drive.google") ||
      cleanUrl.includes("http")
    );
  }

  // Fullscreen API toggle
  function toggleBrowserFullscreen(element) {
    if (!document.fullscreenElement) {
      if (element && element.requestFullscreen) {
        element.requestFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }
</script>

<svelte:head>
  <title>Minhas Tarefas - Checklist Alug</title>
  <meta
    name="description"
    content="Visualize todas as tarefas e movimentações atribuídas a você no projeto Entregas e Retiradas."
  />
</svelte:head>

<div
  class="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans select-none"
>
  <!-- Top Navbar -->
  <Navbar showDashboard={true} />

  <!-- Main Container -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-6">
    <!-- Header Card -->
    <div
      class="bg-white border border-slate-200 shadow-sm rounded-3xl p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden"
    >
      <div class="z-10">
        <div class="flex items-center gap-2 mb-1">
          <span
            class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100"
          >
            Entregas e Retiradas
          </span>
        </div>
        <h1
          class="text-2xl sm:text-3xl font-black text-slate-900 leading-tight"
        >
          Minhas Tarefas
        </h1>
        <p class="text-xs sm:text-sm text-slate-500 mt-1">
          Acompanhe as tarefas e operações atribuídas ao seu usuário no quadro
          geral.
        </p>
      </div>

      <!-- Refresh Action -->
      <div class="z-10 flex items-center gap-3">
        <button
          onclick={fetchAssignedTasks}
          disabled={loading}
          class="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all cursor-pointer flex items-center gap-2 text-xs sm:text-sm border border-slate-200 active:scale-95 disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 {loading ? 'animate-spin' : ''}"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2.2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <!-- Summary Stats Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
      <div
        class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between"
      >
        <span class="text-xs font-bold text-slate-400 uppercase tracking-wider"
          >Total Atribuídas</span
        >
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl sm:text-3xl font-black text-slate-800"
            >{stats.total}</span
          >
          <span class="text-xs font-medium text-slate-400">tarefas</span>
        </div>
      </div>

      <div
        class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between"
      >
        <span class="text-xs font-bold text-blue-500 uppercase tracking-wider"
          >Entregas</span
        >
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl sm:text-3xl font-black text-blue-600"
            >{stats.entregas}</span
          >
          <span class="text-xs font-medium text-slate-400">cards</span>
        </div>
      </div>

      <div
        class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between"
      >
        <span class="text-xs font-bold text-amber-500 uppercase tracking-wider"
          >Retiradas</span
        >
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl sm:text-3xl font-black text-amber-600"
            >{stats.retiradas}</span
          >
          <span class="text-xs font-medium text-slate-400">cards</span>
        </div>
      </div>

      <div
        class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between"
      >
        <span class="text-xs font-bold text-indigo-500 uppercase tracking-wider"
          >Outros Estágios</span
        >
        <div class="flex items-baseline gap-2 mt-2">
          <span class="text-2xl sm:text-3xl font-black text-indigo-600"
            >{stats.outras}</span
          >
          <span class="text-xs font-medium text-slate-400">cards</span>
        </div>
      </div>
    </div>

    <!-- Controls Bar: Search & Column Filters -->
    <div
      class="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center"
    >
      <!-- Search Input -->
      <div class="relative flex-1">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          class="h-5 w-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
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
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Buscar por título ou descrição..."
          class="w-full pl-10 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 font-medium transition-all"
        />
      </div>

      <!-- Column Filter Pills -->
      {#if availableColumns.length > 1}
        <div
          class="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none"
        >
          {#each availableColumns as colName}
            <button
              onclick={() => (selectedColumn = colName)}
              class="px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap border {selectedColumn ===
              colName
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'}"
            >
              {colName === "All" ? "Todas as Colunas" : colName}
            </button>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Error Banner -->
    {#if errorMsg}
      <div
        class="p-4 bg-red-50 border border-red-200 text-red-700 rounded-2xl text-sm font-medium flex items-center gap-3"
      >
        <span class="text-base">⚠️</span>
        <span>{errorMsg}</span>
      </div>
	  {#if hasMore}
		<div class="flex justify-center pt-5">
		  <button
			onclick={() => fetchAssignedTasks({ append: true })}
			disabled={loadingMore}
			class="px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-700 disabled:opacity-50"
		  >
			{loadingMore ? 'Carregando…' : 'Carregar mais tarefas'}
		  </button>
		</div>
	  {/if}
    {/if}

    <!-- Main Task Grid / State Display -->
    {#if loading}
      <!-- Loading Skeleton/Spinner -->
      <div
        class="py-16 flex flex-col justify-center items-center gap-4 text-center"
      >
        <div class="relative w-12 h-12 flex items-center justify-center">
          <div
            class="absolute inset-0 rounded-full border-4 border-slate-200"
          ></div>
          <div
            class="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"
          ></div>
        </div>
        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Buscando tarefas no Firestore...
        </p>
      </div>
    {:else if filteredTasks.length === 0}
      <!-- Empty State -->
      <div
        class="bg-white border border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center justify-center shadow-xs"
      >
        <div
          class="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-3xl mb-4"
        >
          📌
        </div>
        <h3 class="text-lg font-bold text-slate-800">
          {searchQuery || selectedColumn !== "All"
            ? "Nenhuma tarefa encontrada para este filtro"
            : "Nenhuma tarefa atribuída a você"}
        </h3>
        <p class="text-xs text-slate-500 max-w-sm mt-1">
          {searchQuery || selectedColumn !== "All"
            ? "Tente ajustar os termos da busca ou mudar a coluna selecionada."
            : "Você não possui tarefas ativas no quadro 'Entregas e Retiradas' no momento."}
        </p>
      </div>
    {:else}
      <!-- Task Cards Grid -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each filteredTasks as task (task.id)}
          <div
            onclick={() => openTaskModal(task)}
            onkeydown={(e) => e.key === "Enter" && openTaskModal(task)}
            role="button"
            tabindex="0"
            class="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-5 shadow-xs hover:shadow-lg transition-all flex flex-col justify-between group relative overflow-hidden cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <div class="space-y-3">
              <!-- Header: Status Column Badge & Due Status -->
              <div class="flex items-center justify-between gap-2">
                <span
                  class="px-2.5 py-1 rounded-lg text-xs font-extrabold tracking-wide uppercase border bg-slate-100 text-slate-700 border-slate-200"
                >
                  {task.columnName}
                </span>

                <!-- Overdue / Due Indicator -->
                {#if task.dueDateTime}
                  <span
                    class="px-2 py-0.5 rounded-md text-[11px] font-bold border {isOverdue(
                      task.dueDateTime,
                    )
                      ? 'bg-red-50 text-red-600 border-red-200'
                      : 'bg-emerald-50 text-emerald-700 border-emerald-200'}"
                  >
                    {isOverdue(task.dueDateTime)
                      ? "⏰ Atrasada"
                      : "📅 No Prazo"}
                  </span>
                {/if}
              </div>

              <!-- Task Title -->
              <h3
                class="text-base font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors leading-snug"
              >
                {task.title || "Sem Título"}
              </h3>

              <!-- Prominent Date & Time Banner Box -->
              {#if task.dueDateTime}
                <div
                  class="bg-blue-50/80 border border-blue-200 rounded-xl p-3 flex items-center gap-3"
                >
                  <div
                    class="p-2 bg-blue-600 text-white rounded-lg flex items-center justify-center shadow-xs"
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
                        stroke-width="2.2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <div class="flex flex-col">
                    <span
                      class="text-[10px] font-black uppercase tracking-wider text-blue-600"
                      >Data e Horário</span
                    >
                    <span
                      class="text-sm font-extrabold text-slate-900 leading-tight"
                    >
                      {formatDueDate(task.dueDateTime)}
                    </span>
                  </div>
                </div>
              {:else}
                <div
                  class="bg-slate-100/60 border border-slate-200/60 rounded-xl p-3 flex items-center gap-3"
                >
                  <div
                    class="p-2 bg-slate-300 text-slate-600 rounded-lg flex items-center justify-center"
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
                        stroke-width="2"
                        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <span class="text-xs font-bold text-slate-400 italic"
                    >Sem data limite definida</span
                  >
                </div>
              {/if}

              <!-- Description preview if available -->
              {#if task.description}
                <p
                  class="text-xs text-slate-600 line-clamp-2 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200"
                >
                  {task.description}
                </p>
              {/if}

              <!-- Tags & Attachments Counter Pills -->
              <div class="flex items-center justify-between gap-2 pt-1">
                {#if Array.isArray(task.tags) && task.tags.length > 0}
                  <div class="flex flex-wrap gap-1.5">
                    {#each task.tags as tagId}
                      {#if projectTagsMap[tagId]}
                        <span
                          class="px-2.5 py-1 rounded-lg text-[11px] font-bold text-white shadow-2xs"
                          style="background-color: {projectTagsMap[tagId]
                            .color || '#64748b'};"
                        >
                          {projectTagsMap[tagId].name}
                        </span>
                      {/if}
                    {/each}
                  </div>
                {:else}
                  <div></div>
                {/if}

                {#if Array.isArray(task.files) && task.files.length > 0}
                  <span
                    class="text-[11px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200 flex items-center gap-1"
                  >
                    📎 {task.files.length}
                    {task.files.length === 1 ? "anexo" : "anexos"}
                  </span>
                {/if}
              </div>
            </div>

            <!-- Hover prompt footer -->
            <div
              class="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-semibold group-hover:text-blue-600 transition-colors"
            >
              <span>Ver detalhes completos</span>
              <span class="group-hover:translate-x-1 transition-transform"
                >➔</span
              >
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </main>
</div>

<!-- Task Detail Modal -->
{#if selectedTask}
  <!-- Modal Backdrop -->
  <div
    onclick={closeTaskModal}
    onkeydown={(e) => e.key === "Escape" && closeTaskModal()}
    role="button"
    tabindex="0"
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
    aria-label="Fechar modal de detalhes"
  >
    <!-- Modal Dialog Panel -->
    <div
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-modal-title"
      tabindex="-1"
      transition:fly={{ y: 20, duration: 250 }}
      class="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden text-left relative"
    >
      <!-- Modal Header -->
      <div
        class="p-5 sm:p-6 border-b border-slate-200 flex items-start justify-between gap-4 bg-slate-50/50"
      >
        <div class="space-y-1.5 flex-1 pr-4">
          <div class="flex flex-wrap items-center gap-2">
            <span
              class="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-100"
            >
              {selectedTask.projectTitle || "Entregas e Retiradas"}
            </span>
            <span
              class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold tracking-wide uppercase border bg-slate-100 text-slate-700 border-slate-200"
            >
              {selectedTask.columnName}
            </span>
            {#if selectedTask.dueDateTime}
              <span
                class="px-2.5 py-0.5 rounded-lg text-xs font-extrabold border {isOverdue(
                  selectedTask.dueDateTime,
                )
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'}"
              >
                {isOverdue(selectedTask.dueDateTime)
                  ? "⏰ Atrasada"
                  : "📅 No Prazo"}
              </span>
            {/if}
          </div>
          <h2
            id="task-modal-title"
            class="text-xl sm:text-2xl font-black text-slate-900 leading-snug"
          >
            {selectedTask.title || "Sem Título"}
          </h2>
        </div>

        <!-- Close Button -->
        <button
          onclick={closeTaskModal}
          class="p-2 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-300 shrink-0"
          aria-label="Fechar detalhes da tarefa"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
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

      <!-- Modal Body (Scrollable) -->
      <div class="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
        <!-- Date & Time Box -->
        {#if selectedTask.dueDateTime}
          <div
            class="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex items-center gap-3.5"
          >
            <div
              class="p-2.5 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-xs"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2.2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 002-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div class="flex flex-col">
              <span
                class="text-xs font-black uppercase tracking-wider text-blue-600"
                >Data e Horário Limite</span
              >
              <span class="text-base font-extrabold text-slate-900">
                {formatDueDate(selectedTask.dueDateTime)}
              </span>
            </div>
          </div>
        {/if}

        <!-- Description section -->
        <div class="space-y-2">
          <h3
            class="text-xs font-black uppercase tracking-wider text-slate-400"
          >
            Descrição
          </h3>
          {#if selectedTask.description}
            <div
              class="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm text-slate-800 leading-relaxed whitespace-pre-line font-medium"
            >
              {selectedTask.description}
            </div>
          {:else}
            <p
              class="text-xs text-slate-400 italic bg-slate-50/50 p-3 rounded-xl border border-slate-200"
            >
              Nenhuma descrição informada para esta tarefa.
            </p>
          {/if}
        </div>

        <!-- Tags Section -->
        {#if Array.isArray(selectedTask.tags) && selectedTask.tags.length > 0}
          <div class="space-y-2">
            <h3
              class="text-xs font-black uppercase tracking-wider text-slate-400"
            >
              Etiquetas
            </h3>
            <div class="flex flex-wrap gap-2">
              {#each selectedTask.tags as tagId}
                {#if projectTagsMap[tagId]}
                  <span
                    class="px-3 py-1 rounded-xl text-xs font-bold text-white shadow-2xs"
                    style="background-color: {projectTagsMap[tagId].color ||
                      '#64748b'};"
                  >
                    {projectTagsMap[tagId].name}
                  </span>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        <!-- Files & Images Attachments Section -->
        <div class="space-y-3">
          <h3
            class="text-xs font-black uppercase tracking-wider text-slate-400"
          >
            Imagens e Anexos ({Array.isArray(selectedTask.files)
              ? selectedTask.files.length
              : 0})
          </h3>

          {#if Array.isArray(selectedTask.files) && selectedTask.files.length > 0}
            <!-- Images Gallery Grid -->
            {#if selectedTask.files.some(isImageFile)}
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {#each selectedTask.files as file, index}
                  {#if isImageFile(file)}
                    <button
                      type="button"
                      onclick={(e) => openImagePreview(file, e)}
                      class="group relative rounded-2xl overflow-hidden border border-slate-200 aspect-video bg-slate-100 hover:border-blue-500 focus:outline-none transition-all cursor-pointer shadow-xs hover:shadow-md active:scale-95"
                      title="Clique para expandir imagem em tela cheia"
                    >
                      <img
                        src={getFileUrl(file)}
                        alt={getFileName(file, index)}
                        loading="lazy"
                        class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div
                        class="absolute inset-0 bg-slate-900/20 group-hover:bg-slate-900/40 transition-colors flex items-center justify-center"
                      >
                        <span
                          class="px-3 py-1.5 bg-white/95 rounded-full text-slate-900 text-xs font-extrabold opacity-90 group-hover:opacity-100 transition-opacity shadow-md flex items-center gap-1.5 pointer-events-none"
                        >
                          <span>🔍 Expandir</span>
                        </span>
                      </div>
                    </button>
                  {/if}
                {/each}
              </div>
            {/if}

            <!-- Non-image attachments list -->
            {#if selectedTask.files.some((f) => !isImageFile(f))}
              <div class="space-y-2 pt-2">
                {#each selectedTask.files as file, index}
                  {#if !isImageFile(file)}
                    <a
                      href={getFileUrl(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      class="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-all text-xs font-bold text-slate-700 hover:text-blue-600 group"
                    >
                      <div class="flex items-center gap-2.5 truncate pr-2">
                        <span class="text-base">📎</span>
                        <span class="truncate">{getFileName(file, index)}</span>
                      </div>
                      <span
                        class="text-[11px] font-semibold text-blue-600 group-hover:underline"
                      >
                        Baixar ↗
                      </span>
                    </a>
                  {/if}
                {/each}
              </div>
            {/if}
          {:else}
            <div
              class="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-center text-xs text-slate-400 font-medium"
            >
              Nenhum arquivo ou imagem anexado a esta tarefa.
            </div>
          {/if}
        </div>
      </div>

      <!-- Modal Footer -->
      <div
        class="p-4 sm:p-5 border-t border-slate-200 bg-slate-50/50 flex justify-end"
      >
        <button
          onclick={closeTaskModal}
          class="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl text-xs sm:text-sm transition-all cursor-pointer shadow-xs active:scale-95"
        >
          Fechar
        </button>
      </div>
    </div>

    <!-- Lightbox Nested inside Modal Backdrop to preserve stacking context -->
    {#if activeImagePreview}
      <div
        onclick={(e) => {
          e.stopPropagation();
          activeImagePreview = null;
        }}
        onkeydown={(e) => e.key === "Escape" && (activeImagePreview = null)}
        role="button"
        tabindex="0"
        transition:fade={{ duration: 150 }}
        class="fixed inset-0 z-99999 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-between p-4 sm:p-6 cursor-zoom-out select-none"
        aria-label="Fechar visualização de imagem"
      >
        <!-- Top Controls Bar: Close Button Only -->
        <div
          onclick={(e) => e.stopPropagation()}
          onkeydown={() => {}}
          role="toolbar"
          tabindex="-1"
          class="w-full max-w-4xl flex items-center justify-end z-10"
        >
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              activeImagePreview = null;
            }}
            class="p-2.5 bg-slate-900/90 hover:bg-red-600 text-slate-200 hover:text-white rounded-2xl transition-all cursor-pointer border border-slate-800 shadow-xl flex items-center gap-2"
            aria-label="Fechar imagem"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span class="text-xs font-bold pr-1">Fechar</span>
          </button>
        </div>

        <!-- Main High-Res Image Display -->
        <div
          class="flex-1 w-full flex items-center justify-center py-4 overflow-hidden"
        >
          <img
            id="fullscreen-preview-img"
            src={activeImagePreview}
            alt="Imagem expandida em tela cheia"
            class="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl transition-transform duration-200 hover:scale-[1.02]"
          />
        </div>

        <!-- Bottom Hint -->
        <div
          class="text-xs font-medium text-slate-400 z-10 pointer-events-none"
        >
          Clique em qualquer lugar da tela ou pressione ESC para fechar
        </div>
      </div>
    {/if}
  </div>
{/if}
