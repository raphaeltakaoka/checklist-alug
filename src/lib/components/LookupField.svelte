<script>
	import { onDestroy } from 'svelte';
	import { authenticatedFetch } from '$lib/api.js';

	let { value = $bindable(''), selectedId = null, error = '', config, onSelect, onClear, onInput = () => {} } = $props();
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
	let queryTerm = '';

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
		open = !selectedId;
		const term = config.normalize(value);
		queryTerm = term;
		if (selectedId || term.length < 3) return;
		if (!navigator.onLine) {
			searchError = config.offlineMessage;
			return;
		}
		const current = version;
		searching = true;
		timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const response = await authenticatedFetch(`${config.endpoint}?q=${encodeURIComponent(term)}`, { signal: controller.signal });
				const data = await response.json();
				if (current !== version) return;
				results = data[config.resultKey] || [];
				searched = true;
			} catch (error) {
				if (current === version && error?.name !== 'AbortError') {
					searchError = config.failureMessage;
				}
			} finally {
				if (current === version) searching = false;
			}
		}, 300);
	}

	function select(item) {
		invalidate();
		open = false;
		searchError = '';
		onSelect(item);
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
		if (selectedId) return;
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
		if (selectedId || config.normalize(value) !== queryTerm) {
			invalidate();
			open = false;
		}
	});
	onDestroy(invalidate);
</script>

<svelte:document onpointerdown={event => {
	if (!container?.contains(event.target)) open = false;
}} />

<div class="field lookup-field" bind:this={container} onfocusout={event => {
	// A mobile tap can blur the input with no next focus target before its click.
	if (event.relatedTarget && !container?.contains(event.relatedTarget)) open = false;
}}>
	<label for={config.id}>{config.label}</label>
	<input
		id={config.id}
		bind:this={input}
		bind:value
		readonly={!!selectedId}
		maxlength={config.maxLength}
		autocomplete="off"
		placeholder={config.placeholder}
		autocapitalize={config.autocapitalize || 'none'}
		spellcheck="false"
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={open && results.length > 0}
		aria-controls={`${config.id}-options`}
		aria-activedescendant={open && activeIndex >= 0 ? `${config.id}-option-${activeIndex}` : undefined}
		aria-invalid={!!error}
		aria-describedby={`${config.id}-help ${config.id}-error`}
		oninput={event => {
			value = config.normalizeInput ? config.normalizeInput(event.currentTarget.value) : event.currentTarget.value;
			event.currentTarget.value = value;
			onInput();
			search();
		}}
		onfocus={() => { if (!selectedId) search(); }}
		onkeydown={keydown}
	/>
	{#if selectedId}
		<div class="linked-selection"><span>{config.linkedLabel}</span><button type="button" class="text-action" onclick={clear}>{config.clearLabel}</button></div>
	{/if}
	<span id={`${config.id}-help`} class="muted">{selectedId ? config.linkedHelp : config.help}</span>
	{#if open}
		<div role="status" class="muted">
			{#if searching}{config.loadingMessage}
			{:else if searchError}{searchError} <button type="button" class="text-action" onclick={search}>Tentar novamente</button>
			{:else if searched && !results.length}{config.emptyMessage}{/if}
		</div>
	{/if}
	<ul id={`${config.id}-options`} role="listbox" aria-label={config.resultsLabel} hidden={!open || !results.length}>
		{#each results as item, index (item.id)}
			<li role="presentation"><button
				type="button"
				role="option"
				id={`${config.id}-option-${index}`}
				aria-selected={activeIndex === index}
				class:active={activeIndex === index}
				onclick={() => select(item)}
			><strong>{config.primary(item)}</strong><span>{config.secondary(item)}</span></button></li>
		{/each}
	</ul>
	<span id={`${config.id}-error`} class="field-error">{error}</span>
</div>

<style>
	.lookup-field { position: relative; }
	.linked-selection { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: .85rem; }
	ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--border, #d4d4d8); border-radius: 8px; max-height: 260px; overflow-y: auto; }
	ul[hidden] { display: none; }
	li button { display: flex; flex-direction: column; gap: 4px; width: 100%; padding: 12px; text-align: left; background: transparent; color: inherit; border: 0; cursor: pointer; }
	li button:hover, li button:focus-visible, li button.active { background: var(--surface-muted, #f4f4f5); }
	li span { font-size: .85rem; }
</style>
