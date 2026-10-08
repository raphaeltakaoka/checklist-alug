<script>
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getInspection, saveInspection, deleteInspection } from '$lib/db.js';
	import { authenticatedFetch } from '$lib/api.js';
	import { authState } from '$lib/auth.svelte.js';
	import { ui, notify } from '$lib/ui.svelte.js';
	import { revokeMediaPreview } from '$lib/mediaPreview.js';
	import InspectionReport from '$lib/components/InspectionReport.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	let inspection = $state(null);
	let loading = $state(true);
	let error = $state('');
	let request = 0;
	function release(record) {
		if (!record) return;
		for (const key of [
			'clientLicensePhoto',
			'clientSignature',
			'carDiagramImage'
		])
			revokeMediaPreview(record[key]);
		for (const part of Object.values(record.partStates || {}))
			for (const photo of part.photos || []) revokeMediaPreview(photo);
	}
	async function load(id) {
		const token = ++request;
		loading = true;
		error = '';
		try {
			const record = await getInspection(authState.user.uid, id);
			if (token === request) {
				release(inspection);
				inspection = record;
			}
		} catch {
			if (token === request) error = 'Não foi possível abrir esta vistoria.';
		} finally {
			if (token === request) loading = false;
		}
	}
	$effect(() => {
		load(page.params.id);
	});
	onDestroy(() => {
		request++;
		release(inspection);
	});
	async function latestForMutation() {
		if (ui.syncingIds.has(inspection.id))
			throw new Error('Aguarde o envio terminar.');
		const latest = await getInspection(authState.user.uid, inspection.id);
		if (!latest) throw new Error('Vistoria indisponível.');
		inspection = latest;
	}
	async function remove() {
		await latestForMutation();
		if (inspection.synced)
			await authenticatedFetch(
				`/api/checklists/${encodeURIComponent(inspection.id)}`,
				{ method: 'DELETE' }
			);
		await deleteInspection(authState.user.uid, inspection.id);
		notify('Vistoria excluída.', 'success');
		await goto('/dashboard');
	}
	async function removePhoto(partId, index) {
		await latestForMutation();
		const updated = $state.snapshot(inspection);
		const part = updated.partStates[partId];
		if (inspection.synced) {
			const photoPath = part.photoPaths?.[index];
			if (!photoPath) throw new Error('Caminho da foto indisponível.');
			const response = await authenticatedFetch(
				`/api/checklists/${encodeURIComponent(inspection.id)}/photos`,
				{
					method: 'DELETE',
					body: JSON.stringify({ partKey: partId, photoPath })
				}
			);
			updated.partStates = (await response.json()).partStates;
		} else {
			part.photos = part.photos.filter((_, i) => i !== index);
			if (part.photoPaths)
				part.photoPaths = part.photoPaths.filter((_, i) => i !== index);
		}
		if (inspection.synced) {
			inspection = updated;
			await saveInspection(updated).catch(() =>
				notify(
					'Foto excluída. Não foi possível atualizar a cópia deste dispositivo.',
					'error'
				)
			);
		} else {
			await saveInspection(updated);
			inspection = updated;
		}
	}
</script>

<svelte:head><title>Laudo de vistoria · Checklist Alug</title></svelte:head>
<main class="page narrow">
	{#if loading}<div class="loading-page" role="status">
			<span class="spinner"></span>Carregando laudo…
		</div>
	{:else if error}<Notice
			message={error}
			onretry={() => load(page.params.id)}
		/>
	{:else if inspection}<InspectionReport
			{inspection}
			backHref="/dashboard"
			ondelete={authState.canInspect('delete') &&
			!ui.syncingIds.has(inspection.id)
				? remove
				: null}
			ondeletephoto={authState.canInspect('write') &&
			!ui.syncingIds.has(inspection.id)
				? removePhoto
				: null}
		/>
	{:else}<EmptyState
			title="Vistoria não encontrada"
			description="Este registro não está disponível neste dispositivo."
			><a class="btn" href="/dashboard">Voltar ao início</a
			></EmptyState
		>{/if}
</main>
