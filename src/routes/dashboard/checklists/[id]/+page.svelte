<script>
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { db } from '$lib/firebaseDb.js';
	import { doc, getDoc } from 'firebase/firestore';
	import { saveInspection } from '$lib/db.js';
	import { authState } from '$lib/auth.svelte.js';
	import { authenticatedFetch } from '$lib/api.js';
	import { normalizeCloudInspection } from '$lib/inspection.js';
	import { notify } from '$lib/ui.svelte.js';
	import InspectionReport from '$lib/components/InspectionReport.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	let inspection = $state(null);
	let loading = $state(true);
	let error = $state('');
	let request = 0;
	let canEdit = $derived(
		inspection &&
			(authState.hasPermission('administrator', 'write') ||
				(inspection.ownerUid === authState.user?.uid &&
					authState.hasPermission('operations', 'write')))
	);
	async function load(id) {
		const token = ++request;
		loading = true;
		error = '';
		try {
			const snapshot = await getDoc(doc(db, 'checklists', id));
			if (token === request)
				inspection = snapshot.exists()
					? {
							...normalizeCloudInspection(snapshot.data(), snapshot.id),
							synced: true,
							syncState: 'synced'
						}
					: null;
		} catch {
			if (token === request)
				error =
					'Não foi possível carregar este laudo. Verifique sua conexão e tente novamente.';
		} finally {
			if (token === request) loading = false;
		}
	}
	$effect(() => {
		load(page.params.id);
	});
	onDestroy(() => {
		request++;
	});
	async function removePhoto(partKey, index) {
		const photoPath = inspection.partStates[partKey].photoPaths?.[index];
		if (!photoPath) throw new Error('Caminho da foto indisponível.');
		const response = await authenticatedFetch(
			`/api/checklists/${encodeURIComponent(inspection.id)}/photos`,
			{ method: 'DELETE', body: JSON.stringify({ partKey, photoPath }) }
		);
		inspection = {
			...inspection,
			partStates: (await response.json()).partStates
		};
		// Never cache another inspector's report under the current user's offline account.
		if (inspection.ownerUid === authState.user.uid)
			await saveInspection($state.snapshot(inspection)).catch(() =>
				notify(
					'Foto excluída. Não foi possível atualizar a cópia deste dispositivo.',
					'error'
				)
			);
	}
</script>

<svelte:head><title>Laudo sincronizado · Checklist Alug</title></svelte:head>
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
			ondeletephoto={canEdit ? removePhoto : null}
		/>
	{:else}<EmptyState
			title="Laudo não encontrado"
			description="Esta vistoria não está disponível no histórico."
			><a class="btn" href="/dashboard/checklists">Voltar ao histórico</a
			></EmptyState
		>{/if}
</main>
