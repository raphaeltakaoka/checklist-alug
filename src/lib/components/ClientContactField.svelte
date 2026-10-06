<script>
	import { onDestroy } from 'svelte';
	import { authenticatedFetch } from '$lib/api.js';
	import { normalizeContactName } from '$lib/contacts.js';

	let { name = $bindable(''), contactId = null, error = '', onSelect, onClear } = $props();
	let results = $state([]);
	let searching = $state(false);
	let searchError = $state('');
	let searched = $state(false);
	let open = $state(false);
	let activeIndex = $state(-1);
	let container;
	let input;
	let timer;
	let controller;
	let version = 0;

	function invalidate() {
		version++;
		clearTimeout(timer);
		controller?.abort();
		searching = false;
		results = [];
		activeIndex = -1;
	}

	function search() {
		invalidate();
		searchError = '';
		searched = false;
		open = !contactId;
		const term = normalizeContactName(name);
		if (contactId || term.length < 3) return;
		if (!navigator.onLine) {
			searchError = 'Conecte-se à internet para buscar um contato cadastrado.';
			return;
		}
		const current = version;
		searching = true;
		timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const response = await authenticatedFetch(`/api/contacts/search?q=${encodeURIComponent(term)}`, { signal: controller.signal });
				const data = await response.json();
				if (current !== version) return;
				results = data.contacts || [];
				searched = true;
			} catch (error) {
				if (current === version && error?.name !== 'AbortError') {
					searchError = 'Não foi possível buscar contatos. Verifique a conexão e tente novamente.';
				}
			} finally {
				if (current === version) searching = false;
			}
		}, 300);
	}

	function select(contact) {
		invalidate();
		open = false;
		searchError = '';
		onSelect(contact);
		input?.focus();
	}

	function clear() {
		invalidate();
		open = false;
		searchError = '';
		searched = false;
		onClear();
		input?.focus();
	}

	function keydown(event) {
		if (contactId) return;
		if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && results.length) {
			event.preventDefault();
			open = true;
			activeIndex = event.key === 'ArrowDown'
				? (activeIndex + 1) % results.length
				: (activeIndex <= 0 ? results.length - 1 : activeIndex - 1);
		} else if (event.key === 'Enter' && open && activeIndex >= 0) {
			event.preventDefault();
			select(results[activeIndex]);
		} else if (event.key === 'Escape') {
			open = false;
		}
	}

	$effect(() => {
		if (contactId) {
			invalidate();
			open = false;
		}
	});
	onDestroy(invalidate);
</script>

<div class="field contact-field" bind:this={container} onfocusout={event => {
	if (!container?.contains(event.relatedTarget)) open = false;
}}>
	<label for="client">Nome do cliente *</label>
	<input
		id="client"
		bind:this={input}
		bind:value={name}
		readonly={!!contactId}
		maxlength="200"
		autocomplete="off"
		placeholder="Buscar contato cadastrado"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open && results.length > 0}
		aria-controls="client-options"
		aria-activedescendant={open && activeIndex >= 0 ? `client-option-${activeIndex}` : undefined}
		aria-invalid={!!error}
		aria-describedby="client-help client-error"
		oninput={event => { name = event.currentTarget.value; search(); }}
		onfocus={() => { if (!contactId) search(); }}
		onkeydown={keydown}
	/>
	{#if contactId}
		<div class="linked-contact"><span>Contato vinculado</span><button type="button" class="text-action" onclick={clear}>Desvincular contato</button></div>
	{/if}
	<span id="client-help" class="muted">{contactId ? 'Desvincule para escolher outro contato.' : 'Digite pelo menos 3 caracteres e selecione um contato.'}</span>
	{#if open}
		<div role="status" class="muted">
			{#if searching}Buscando contatos…
			{:else if searchError}{searchError} <button type="button" class="text-action" onclick={search}>Tentar novamente</button>
			{:else if searched && !results.length}Nenhum contato encontrado. Cadastre o contato no CRM e tente novamente.{/if}
		</div>
	{/if}
	<ul id="client-options" role="listbox" aria-label="Contatos encontrados" hidden={!open || !results.length}>
		{#each results as contact, index (contact.id)}
			<li role="presentation"><button
				type="button"
				role="option"
				id={`client-option-${index}`}
				aria-selected={activeIndex === index}
				class:active={activeIndex === index}
				onclick={() => select(contact)}
			><strong>{contact.nome}</strong><span>{contact.email || contact.telefone || 'Sem contato adicional'}</span></button></li>
		{/each}
	</ul>
	<span id="client-error" class="field-error">{error}</span>
</div>

<style>
	.contact-field { position: relative; }
	.linked-contact { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .85rem; }
	ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border, #d4d4d8); border-radius: 8px; max-height: 260px; overflow-y: auto; }
	ul[hidden] { display: none; }
	li button { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 12px; text-align: left; background: transparent; color: inherit; border: 0; cursor: pointer; }
	li button:hover, li button:focus-visible, li button.active { background: var(--surface-muted, #f4f4f5); }
	li span { font-size: .85rem; }
</style>
