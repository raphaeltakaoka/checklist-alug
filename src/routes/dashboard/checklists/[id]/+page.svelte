<script>
	import { onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { db } from '$lib/firebaseDb.js';
	import { doc, getDoc } from 'firebase/firestore';
	import { authState } from '$lib/auth.svelte.js';
	import { authenticatedFetch } from '$lib/api.js';
	import { normalizeCloudInspection, getPartState } from '$lib/inspection.js';
	import InspectionReport from '$lib/components/InspectionReport.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import InspectionEmailDialog from './InspectionEmailDialog.svelte';
	let inspection = $state(null);
	let loading = $state(true);
	let error = $state('');
	let emailOpen = $state(false);
	let emailSent = $state(false);
	let request = 0;
	let canEdit = $derived(
		inspection &&
			(authState.hasPermission('administrator', 'write') ||
				(inspection.ownerUid === authState.user?.uid &&
					authState.hasPermission('operations', 'write')))
	);
	let canEmail = $derived(
		inspection &&
			(authState.hasPermission('administrator', 'pdf') ||
				(inspection.ownerUid === authState.user?.uid &&
					authState.hasPermission('operations', 'pdf')))
	);
	async function load(id) {
		const token = ++request;
		loading = true;
		error = '';
		emailOpen = false;
		emailSent = false;
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
		const photoPath = getPartState(inspection.partStates, partKey)?.photoPaths?.[index];
		if (!photoPath) throw new Error('Caminho da foto indisponível.');
		const response = await authenticatedFetch(
			`/api/checklists/${encodeURIComponent(inspection.id)}/photos`,
			{ method: 'DELETE', body: JSON.stringify({ partKey, photoPath }) }
		);
		inspection = {
			...inspection,
			partStates: (await response.json()).partStates
		};
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
	{:else if inspection}
		<Notice message={emailSent ? 'E-mail enviado com sucesso!' : ''} type="success" />
		<InspectionReport
			{inspection}
			ondeletephoto={canEdit ? removePhoto : null}
			onemail={() => {
				emailSent = false;
				emailOpen = true;
			}}
			emailDisabled={!canEmail}
		/>
		{#if emailOpen}
			<InspectionEmailDialog
				{inspection}
				onclose={() => (emailOpen = false)}
				onsent={() => {
					emailOpen = false;
					emailSent = true;
				}}
			/>
		{/if}
	{:else}<EmptyState
			title="Laudo não encontrado"
			description="Esta vistoria não está disponível no histórico."
			><a class="btn" href="/dashboard/checklists">Voltar ao histórico</a
			></EmptyState
		>{/if}
</main>
