<script>
	import { onMount } from 'svelte';
	import { authenticatedFetch } from '$lib/api.js';
	import Dialog from '$lib/components/Dialog.svelte';
	import Notice from '$lib/components/Notice.svelte';

	let { inspection, onclose, onsent } = $props();
	const formId = $props.id();
	let endpoint = $derived(`/api/checklists/${encodeURIComponent(inspection.id)}/email`);
	let to = $state('');
	let subject = $state('');
	let message = $state('');
	let loading = $state(true);
	let sending = $state(false);
	let lookupError = $state('');
	let sendError = $state('');

	onMount(() => {
		const controller = new AbortController();
		subject = `Laudo de vistoria · ${inspection.licensePlate}`;
		message = `Olá,\n\nSegue em anexo o laudo de vistoria do veículo ${inspection.licensePlate}.\n\nAtenciosamente,\nEquipe Alug Locadora`;
		loadRecipient(controller.signal);
		return () => controller.abort();
	});

	async function loadRecipient(signal) {
		try {
			const response = await authenticatedFetch(endpoint, { signal, cache: 'no-store' });
			const data = await response.json();
			if (!signal.aborted) to = data.email;
		} catch {
			if (!signal.aborted) lookupError = 'Não foi possível consultar o e-mail do cliente. Digite o destinatário.';
		} finally {
			if (!signal.aborted) loading = false;
		}
	}

	async function send(event) {
		event.preventDefault();
		if (loading || sending) return;
		sendError = '';
		sending = true;
		try {
			await authenticatedFetch(endpoint, {
				method: 'POST',
				body: JSON.stringify({ to: to.trim(), subject: subject.trim(), message: message.trim() })
			});
			onsent();
		} catch (error) {
			sendError = error instanceof TypeError ? 'Falha de conexão ao enviar o e-mail.' : error.message;
		} finally {
			sending = false;
		}
	}
</script>

<Dialog title="Enviar laudo por e-mail" {onclose} busy={sending}>
	<form id={formId} class="stack" onsubmit={send}>
		<p class="muted">O PDF da vistoria de {inspection.licensePlate} será enviado em anexo.</p>
		<Notice message={lookupError} />
		<div class="field">
			<label for={`${formId}-to`}>E-mail do destinatário</label>
			<input
				id={`${formId}-to`} type="email" required maxlength="254" autocomplete="off"
				bind:value={to} disabled={loading || sending}
			/>
			{#if loading}<span class="field-help" role="status">Consultando e-mail do cliente…</span>{/if}
		</div>
		<div class="field">
			<label for={`${formId}-subject`}>Assunto</label>
			<input id={`${formId}-subject`} required maxlength="200" bind:value={subject} disabled={sending} />
		</div>
		<div class="field">
			<label for={`${formId}-message`}>Mensagem</label>
			<textarea id={`${formId}-message`} rows="5" required maxlength="20000" bind:value={message} disabled={sending}></textarea>
		</div>
		<Notice message={sendError} />
	</form>
	{#snippet footer()}
		<button class="btn" type="button" onclick={onclose} disabled={sending}>Cancelar</button>
		<button class="btn primary" type="submit" form={formId} disabled={loading || sending}>
			{sending ? 'Enviando…' : 'Enviar e-mail'}
		</button>
	{/snippet}
</Dialog>
