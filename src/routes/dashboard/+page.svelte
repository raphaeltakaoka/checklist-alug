<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { getAllInspections, deleteInspection } from '$lib/db.js';
	import { authenticatedFetch } from '$lib/api.js';
	import { authState } from '$lib/auth.svelte.js';
	import { ui, notify } from '$lib/ui.svelte.js';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import InspectionRow from '$lib/components/InspectionRow.svelte';
	let inspections = $state([]);
	let loading = $state(true);
	let error = $state('');
	let search = $state('');
	let offline = $state(false);
	let syncing = $derived(ui.syncingIds);
	let deleting = $state(null);
	let deleteBusy = $state(false);
	let deleteError = $state('');
	let mounted = true;
	const matches = (record) =>
		`${record.licensePlate} ${record.clientName}`
			.toLocaleLowerCase()
			.includes(search.trim().toLocaleLowerCase());
	let drafts = $derived(
		inspections.filter((record) => record.status === 'draft' && matches(record))
	);
	let pending = $derived(
		inspections.filter(
			(record) =>
				record.status === 'completed' && !record.synced && matches(record)
		)
	);
	let allPending = $derived(
		inspections.filter(
			(record) => record.status === 'completed' && !record.synced
		)
	);
	async function load() {
		error = '';
		try {
			inspections = await getAllInspections(authState.user.uid);
		} catch {
			error = 'Não foi possível abrir suas vistorias neste dispositivo.';
		} finally {
			loading = false;
		}
	}
	async function sync(record) {
		if (offline || syncing.has(record.id)) return;
		ui.syncingIds = new Set([...syncing, record.id]);
		try {
			const { syncInspectionToCloud } = await import('$lib/sync.js');
			await syncInspectionToCloud(record);
		} catch {
			/* The persisted sync state is displayed in the row. */
		} finally {
			if (mounted) await load();
			ui.syncingIds = new Set(
				[...ui.syncingIds].filter((id) => id !== record.id)
			);
		}
	}
	async function syncPending() {
		for (const record of allPending) {
			if (!mounted) break;
			await sync(record);
		}
	}
	onMount(() => {
		mounted = true;
		offline = !navigator.onLine;
		load().then(syncPending);
		const online = () => {
			offline = false;
			syncPending();
		};
		const disconnected = () => (offline = true);
		window.addEventListener('online', online);
		window.addEventListener('offline', disconnected);
		return () => {
			mounted = false;
			window.removeEventListener('online', online);
			window.removeEventListener('offline', disconnected);
		};
	});
	async function remove() {
		if (!deleting || deleteBusy) return;
		deleteBusy = true;
		deleteError = '';
		try {
			if (deleting.synced)
				await authenticatedFetch(
					`/api/checklists/${encodeURIComponent(deleting.id)}`,
					{ method: 'DELETE' }
				);
			await deleteInspection(authState.user.uid, deleting.id);
			inspections = inspections.filter((record) => record.id !== deleting.id);
			deleting = null;
			notify('Vistoria excluída.', 'success');
		} catch {
			deleteError = 'Não foi possível excluir. Tente novamente.';
		} finally {
			deleteBusy = false;
		}
	}
</script>

<svelte:head><title>Início · Checklist Alug</title></svelte:head>
<main class="page">
	<div class="page-heading">
		<div>
			<div class="eyebrow">Seu espaço de trabalho</div>
			<h1>Olá, {authState.displayName.split(' ')[0]}.</h1>
			<p>Uma nova vistoria. Tudo em ordem.</p>
		</div>
		{#if authState.canInspect('write')}<a
				class="btn primary"
				href="/dashboard/new"><Icon name="plus" />Nova vistoria</a
			>{/if}
	</div>
	{#if page.url.searchParams.get('completed')}<Notice
			type="success"
			message="Vistoria concluída e salva neste dispositivo. Acompanhe o envio abaixo."
		/>{/if}
	{#if offline}<Notice
			type="info"
			message="Você está offline. Suas vistorias ficam salvas neste dispositivo e serão enviadas quando a conexão voltar."
		/>{/if}
	<div class="section-heading section">
		<span class="muted inline"
			><Icon
				name={offline ? 'offline' : syncing.size ? 'refresh' : 'cloud'}
				size={17}
			/>{offline
				? 'Sem conexão'
				: syncing.size
					? 'Enviando vistorias…'
					: allPending.length
						? `${allPending.length} ${allPending.length === 1 ? 'vistoria aguardando envio' : 'vistorias aguardando envio'}`
						: 'Tudo sincronizado'}</span
		><a class="text-action" href="/dashboard/checklists"
			>Ver histórico<Icon name="arrow" size={16} /></a
		>
	</div>
	<div class="search">
		<Icon name="search" size={18} /><input
			type="search"
			aria-label="Buscar rascunhos e vistorias pendentes"
			bind:value={search}
			placeholder="Buscar por placa ou cliente"
		/>
	</div>
	<Notice message={error} onretry={load} />
	{#if loading}<div
			class="panel section"
			role="status"
			aria-label="Carregando vistorias"
		>
			<div class="skeleton"></div>
			<div class="skeleton"></div>
		</div>
	{:else if !error}
		<section class="section">
			<div class="section-heading">
				<h2>Continuar vistoria <span class="count">{drafts.length}</span></h2>
			</div>
			{#if drafts.length}<div class="panel inspection-list">
					{#each drafts as record (record.id)}<InspectionRow
							inspection={record}
							href={`/dashboard/new?id=${encodeURIComponent(record.id)}`}
							ondelete={authState.canInspect('delete')
								? () => {
										deleting = record;
										deleteError = '';
									}
								: null}
						/>{/each}
				</div>
			{:else}<EmptyState
					icon="edit"
					title={search
						? 'Nenhum rascunho encontrado'
						: 'Nenhuma vistoria em andamento'}
					description={search
						? 'Tente outra placa ou nome de cliente.'
						: 'Ao iniciar uma vistoria, você pode salvar e continuar depois.'}
				/>{/if}
		</section>
		<section class="section">
			<div class="section-heading">
				<h2>Aguardando envio <span class="count">{pending.length}</span></h2>
				{#if pending.length && !offline}<button
						class="text-action"
						disabled={syncing.size > 0}
						onclick={syncPending}
						><Icon name="refresh" size={16} />Enviar todas</button
					>{/if}
			</div>
			{#if pending.length}<div class="panel inspection-list">
					{#each pending as record (record.id)}<InspectionRow
							inspection={record}
							href={`/dashboard/new/${encodeURIComponent(record.id)}`}
							busy={syncing.has(record.id)}
							onretry={!offline ? () => sync(record) : null}
						/>{/each}
				</div>
			{:else}<EmptyState
					icon="check"
					title={search
						? 'Nenhuma vistoria pendente encontrada'
						: 'Nenhum envio pendente'}
					description={search
						? 'Tente outra placa ou nome de cliente.'
						: 'As vistorias concluídas e sincronizadas estão no histórico.'}
				/>{/if}
		</section>
	{/if}
</main>
{#if deleting}<Dialog
		title="Excluir vistoria?"
		onclose={() => (deleting = null)}
		busy={deleteBusy}
		><div class="stack">
			<p>
				A vistoria de <strong>{deleting.licensePlate}</strong> será excluída. Esta
				ação não pode ser desfeita.
			</p>
			<Notice message={deleteError} />
		</div>
		{#snippet footer()}<button
				class="btn"
				disabled={deleteBusy}
				onclick={() => (deleting = null)}>Cancelar</button
			><button class="btn danger" disabled={deleteBusy} onclick={remove}
				>{deleteBusy ? 'Excluindo…' : 'Excluir vistoria'}</button
			>{/snippet}</Dialog
	>{/if}
