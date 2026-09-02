<script>
	import { onMount } from 'svelte';
	import { db } from '$lib/firebaseDb.js';
	import { authState } from '$lib/auth.svelte.js';
	import {
		collectionGroup,
		getDocs,
		limit,
		orderBy,
		query,
		startAfter,
		where
	} from 'firebase/firestore';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import { safeAttachmentUrl } from '$lib/inspection.js';

	// Page states
	let tasks = $state([]);
	let projectTagsMap = $state({});
	let loading = $state(true);
	let errorMsg = $state('');
	let lastDocument = null;
	let hasMore = $state(true);
	let loadingMore = $state(false);

	// Filter and search states
	let searchQuery = $state('');
	let selectedColumn = $state('All');

	// Modal & Lightbox states
	let selectedTask = $state(null);
	let activeImagePreview = $state(null);

	onMount(async () => {
		// Force light theme to match app standard

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
		errorMsg = '';

		try {
			const userId = authState.user.uid;
			const constraints = [
				where('assignedUserId', '==', userId),
				where('state', '==', 'active'),
				orderBy('dueDateKey', 'asc'),
				limit(50)
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
								name: tag.name || 'Tag',
								color: tag.color || '#64748b'
							};
						}
					});
				}

				if ((data.columnName || '').trim().toLowerCase() !== 'monitorar') {
					fetchedItems.push({
						...data,
						id: docSnap.id,
						projectId: data.boardId,
						projectTitle: data.boardTitle || 'Projeto'
					});
				}
			});

			projectTagsMap = tagsMapping;
			tasks = append ? [...tasks, ...fetchedItems] : fetchedItems;
			lastDocument = querySnapshot.docs.at(-1) || null;
			hasMore = querySnapshot.size === 50;
		} catch (e) {
			console.error('Erro ao carregar tarefas do Firestore:', e);
			errorMsg =
				'Ocorreu um erro ao carregar suas tarefas da nuvem. Verifique sua conexão.';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	// Unique list of available column status names (excluding 'Monitorar')
	const availableColumns = $derived([
		'All',
		...Array.from(new Set(tasks.map((t) => t.columnName))).filter(
			(col) => (col || '').trim().toLowerCase() !== 'monitorar'
		)
	]);

	// Filtered tasks based on search & column filter, ordered by due date (sooner first)
	const filteredTasks = $derived(
		tasks
			.filter((task) => {
				const matchesSearch =
					(task.title || '')
						.toLowerCase()
						.includes(searchQuery.toLowerCase()) ||
					(task.description || '')
						.toLowerCase()
						.includes(searchQuery.toLowerCase());

				const matchesColumn =
					selectedColumn === 'All' || task.columnName === selectedColumn;

				return matchesSearch && matchesColumn;
			})
			.sort((a, b) => {
				if (!a.dueDateTime && !b.dueDateTime) return 0;
				if (!a.dueDateTime) return 1;
				if (!b.dueDateTime) return -1;
				return (
					new Date(a.dueDateTime).getTime() - new Date(b.dueDateTime).getTime()
				);
			})
	);

	// Helper function to format due dates
	function formatDueDate(dateTimeStr) {
		if (!dateTimeStr) return null;
		try {
			const d = new Date(dateTimeStr);
			if (isNaN(d.getTime())) return dateTimeStr;

			const day = String(d.getDate()).padStart(2, '0');
			const month = String(d.getMonth() + 1).padStart(2, '0');
			const year = d.getFullYear();
			const hours = String(d.getHours()).padStart(2, '0');
			const minutes = String(d.getMinutes()).padStart(2, '0');

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

		if (url) {
			activeImagePreview = url;
		}
	}

	// File Handling Helpers
	function getFileUrl(fileItem) {
		if (!fileItem) return '';
		if (typeof fileItem === 'string') return safeAttachmentUrl(fileItem);
		return safeAttachmentUrl(
			fileItem.url ||
				fileItem.downloadUrl ||
				fileItem.src ||
				fileItem.link ||
				fileItem.data ||
				fileItem.path ||
				''
		);
	}

	function getFileName(fileItem, index) {
		if (!fileItem) return `Arquivo ${index + 1}`;
		if (
			typeof fileItem === 'object' &&
			(fileItem.name || fileItem.fileName || fileItem.title)
		) {
			return fileItem.name || fileItem.fileName || fileItem.title;
		}
		const url = getFileUrl(fileItem);
		if (url.startsWith('data:image')) return `Imagem ${index + 1}`;
		try {
			const parsed = new URL(url);
			const pathname = parsed.pathname;
			const segments = pathname.split('/').filter(Boolean);
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
		if (url.startsWith('data:image/')) return true;
		if (
			typeof fileItem === 'object' &&
			fileItem.type &&
			fileItem.type.startsWith('image/')
		)
			return true;

		const cleanUrl = url.split('?')[0].toLowerCase();
		return (
			cleanUrl.endsWith('.png') ||
			cleanUrl.endsWith('.jpg') ||
			cleanUrl.endsWith('.jpeg') ||
			cleanUrl.endsWith('.webp') ||
			cleanUrl.endsWith('.gif') ||
			cleanUrl.endsWith('.svg') ||
			cleanUrl.endsWith('.bmp')
		);
	}
</script>

<svelte:head><title>Tarefas · Checklist Alug</title></svelte:head>
<main class="page">
	<div class="page-heading">
		<div>
			<div class="eyebrow">Sua agenda de operações</div>
			<h1>Minhas tarefas</h1>
			<p>Entregas, retiradas e o que precisa da sua atenção.</p>
		</div>
		<button
			class="btn"
			disabled={loading || loadingMore}
			onclick={() => fetchAssignedTasks()}
			><Icon name="refresh" size={18} />Atualizar</button
		>
	</div>
	<div class="toolbar">
		<div class="search">
			<Icon name="search" size={18} /><input
				type="search"
				bind:value={searchQuery}
				aria-label="Buscar tarefas carregadas"
				placeholder="Buscar uma tarefa"
			/>
		</div>
	</div>
	<div class="filter-tabs" aria-label="Filtrar por situação">
		{#each availableColumns as column}<button
				class="btn"
				aria-pressed={selectedColumn === column}
				onclick={() => (selectedColumn = column)}
				>{column === 'All' ? 'Todas' : column}</button
			>{/each}
	</div>
	<Notice message={errorMsg} onretry={() => fetchAssignedTasks()} />
	{#if loading}<div
			class="panel section"
			role="status"
			aria-label="Carregando tarefas"
		>
			{#each [1, 2, 3] as i}<div class="skeleton"></div>{/each}
		</div>
	{:else}
		<div class="section-heading section">
			<h2>
				Próximas atividades <span class="count">{filteredTasks.length}</span>
			</h2>
			<span class="muted">{tasks.length} carregadas</span>
		</div>
		{#if filteredTasks.length}<div class="panel">
				{#each filteredTasks as task (task.projectId + '/' + task.id)}<button
						class="task-row"
						onclick={() => openTaskModal(task)}
						><span class="record-icon"><Icon name="tasks" /></span>
						<div class="task-title">
							<strong>{task.title || 'Sem título'}</strong>
							<p>{task.projectTitle}</p>
						</div>
						<span class="badge">{task.columnName || 'Sem situação'}</span>
						<div class="task-due">
							<span class:overdue={isOverdue(task.dueDateTime)}
								>{task.dueDateTime
									? formatDueDate(task.dueDateTime)
									: 'Sem prazo definido'}</span
							>{#if isOverdue(task.dueDateTime)}<span class="badge danger"
									>Atrasada</span
								>{/if}
						</div>
						<Icon name="chevron" size={17} /></button
					>{/each}
			</div>
		{:else if !errorMsg}<EmptyState
				icon="tasks"
				title={searchQuery || selectedColumn !== 'All'
					? 'Nenhuma tarefa encontrada'
					: 'Nenhuma tarefa atribuída'}
				description={searchQuery || selectedColumn !== 'All'
					? 'Experimente outro termo ou limpe os filtros.'
					: 'Suas próximas atividades aparecerão aqui.'}
				>{#if searchQuery || selectedColumn !== 'All'}<button
						class="text-action"
						onclick={() => {
							searchQuery = '';
							selectedColumn = 'All';
						}}>Limpar filtros</button
					>{/if}</EmptyState
			>{/if}
		{#if hasMore}<div class="inline section" style="justify-content:center">
				<button
					class="btn"
					disabled={loadingMore}
					onclick={() => fetchAssignedTasks({ append: true })}
					>{loadingMore ? 'Carregando…' : 'Carregar mais tarefas'}</button
				>
			</div>{/if}
	{/if}
</main>
{#if selectedTask}
	<Dialog
		title={selectedTask.title || 'Detalhes da tarefa'}
		onclose={closeTaskModal}
		wide
	>
		<div class="stack">
			<div class="inline">
				<span class="badge">{selectedTask.projectTitle}</span><span
					class="badge">{selectedTask.columnName || 'Sem situação'}</span
				>{#if isOverdue(selectedTask.dueDateTime)}<span class="badge danger"
						>Atrasada</span
					>{/if}
			</div>
			{#if selectedTask.dueDateTime}<div class="notice">
					<Icon name="clock" />
					<p>Prazo: {formatDueDate(selectedTask.dueDateTime)}</p>
				</div>{/if}
			<div class="field">
				<h3>Descrição</h3>
				<p
					style="white-space:pre-line;font-size:.9375rem;line-height:1.7;overflow-wrap:anywhere"
				>
					{selectedTask.description || 'Nenhuma descrição informada.'}
				</p>
			</div>
			{#if selectedTask.tags?.length}<div class="inline">
					{#each selectedTask.tags as tagId}{#if projectTagsMap[tagId]}<span
								class="badge">{projectTagsMap[tagId].name}</span
							>{/if}{/each}
				</div>{/if}
			<div class="field">
				<h3>Anexos</h3>
				{#if selectedTask.files?.length}{#each selectedTask.files as file, index}{#if getFileUrl(file)}{#if isImageFile(file)}<button
									class="attachment"
									onclick={(event) => openImagePreview(file, event)}
									><Icon name="image" /><span>{getFileName(file, index)}</span
									><Icon name="eye" size={17} /></button
								>{:else}<a
									class="attachment"
									href={getFileUrl(file)}
									target="_blank"
									rel="noopener noreferrer"
									><Icon name="file" /><span>{getFileName(file, index)}</span
									><Icon name="external" size={17} /></a
								>{/if}{:else}<p class="muted">
								{getFileName(file, index)} — arquivo indisponível.
							</p>{/if}{/each}{:else}<p class="muted">
						Nenhum anexo nesta tarefa.
					</p>{/if}
			</div>
		</div>
		{#snippet footer()}<button class="btn primary" onclick={closeTaskModal}
				>Fechar</button
			>{/snippet}
	</Dialog>
{/if}
{#if activeImagePreview}<Dialog
		title="Visualizar anexo"
		wide
		onclose={() => (activeImagePreview = null)}
		><img
			class="preview-image"
			src={activeImagePreview}
			alt="Anexo da tarefa"
		/><a
			class="text-action"
			href={activeImagePreview}
			target="_blank"
			rel="noopener noreferrer"
			>Abrir arquivo original<Icon name="external" size={16} /></a
		></Dialog
	>{/if}
