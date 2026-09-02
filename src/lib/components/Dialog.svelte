<script module>
	let openDialogs = 0;
	let originalOverflow = '';
</script>

<script>
	import { onMount } from 'svelte';
	import Icon from './Icon.svelte';
	let {
		title,
		onclose,
		children,
		footer = null,
		wide = false,
		busy = false
	} = $props();
	let dialog;
	const titleId = $props.id();
	onMount(() => {
		const previous = document.activeElement;
		if (openDialogs === 0) originalOverflow = document.body.style.overflow;
		openDialogs++;
		document.body.style.overflow = 'hidden';
		dialog.showModal();
		return () => {
			openDialogs--;
			if (openDialogs === 0) document.body.style.overflow = originalOverflow;
			if (previous instanceof HTMLElement && previous.isConnected)
				previous.focus();
		};
	});
	function requestClose(event) {
		event?.preventDefault();
		if (!busy) onclose();
	}
</script>

<dialog
	bind:this={dialog}
	class="app-dialog"
	class:wide
	aria-labelledby={titleId}
	oncancel={requestClose}
	onclick={(event) => {
		if (event.target !== dialog) return;
		const rect = dialog.getBoundingClientRect();
		if (
			event.clientX < rect.left ||
			event.clientX > rect.right ||
			event.clientY < rect.top ||
			event.clientY > rect.bottom
		)
			requestClose(event);
	}}
>
	<div class="dialog-header">
		<h2 id={titleId}>{title}</h2>
		<button
			class="icon-button"
			disabled={busy}
			onclick={requestClose}
			aria-label="Fechar"><Icon name="close" /></button
		>
	</div>
	<div class="dialog-body">{@render children()}</div>
	{#if footer}<div class="dialog-footer">{@render footer()}</div>{/if}
</dialog>
