<script>
	import Icon from './Icon.svelte';
	import { countDamages, formatInspectionDateTime } from '$lib/inspection.js';
	let {
		inspection,
		href,
		onretry = null,
		ondelete = null,
		busy = false
	} = $props();
	let draft = $derived(inspection.status === 'draft');
	let status = $derived(
		draft
			? 'Rascunho'
			: inspection.synced || inspection.syncState === 'synced'
				? 'Sincronizada'
				: busy
					? 'Enviando…'
					: inspection.syncState === 'error'
						? 'Falha no envio'
						: 'Aguardando envio'
	);
	let damages = $derived(
		inspection.damageCount ?? countDamages(inspection.partStates)
	);
</script>

<div class="inspection-row">
	<a class="inspection-link" {href}>
		<div class="record-icon">
			<Icon name={draft ? 'edit' : 'file'} size={22} />
		</div>
		<div class="record-main">
			<strong class="plate">{inspection.licensePlate}</strong><span
				>{inspection.clientName}</span
			>
		</div>
		<div class="record-meta">
			<span>{inspection.inspectionType}</span><span
				>{formatInspectionDateTime(inspection.inspectionDateTime)}</span
			>
		</div>
		<div class="record-status">
			<span
				class="badge"
				class:warning={draft || (!inspection.synced && !busy)}
				class:danger={inspection.syncState === 'error'}
				class:success={inspection.synced}>{status}</span
			><span class="muted"
				>{damages === 0
					? 'Sem danos registrados'
					: `${damages} ${damages === 1 ? 'dano registrado' : 'danos registrados'}`}</span
			>
		</div>
		<span class="record-open"
			>{draft ? 'Continuar' : 'Ver laudo'}<Icon
				name="chevron"
				size={16}
			/></span
		>
	</a>
	{#if onretry || ondelete}<div class="record-actions">
			{#if onretry}<button
					class="icon-button"
					disabled={busy}
					onclick={onretry}
					aria-label={`Reenviar vistoria ${inspection.licensePlate}`}
					><Icon name="refresh" /></button
				>{/if}{#if ondelete}<button
					class="icon-button"
					disabled={busy}
					onclick={ondelete}
					aria-label={`Excluir vistoria ${inspection.licensePlate}`}
					><Icon name="trash" size={18} /></button
				>{/if}
		</div>{/if}
</div>
