<script>
	import Icon from './Icon.svelte';
	let { message, type = 'error', onretry = null, ondismiss = null } = $props();
</script>

{#if message}
	<div class="notice {type}" role={type === 'error' ? 'alert' : 'status'}>
		<Icon
			name={type === 'error' ? 'alert' : type === 'success' ? 'check' : 'cloud'}
		/>
		<p>{message}</p>
		{#if onretry}<button class="text-action" onclick={onretry}
				>Tentar novamente</button
			>{/if}
		{#if ondismiss}<button
				class="icon-button"
				aria-label="Fechar aviso"
				onclick={ondismiss}><Icon name="close" size={18} /></button
			>{/if}
	</div>
{/if}
