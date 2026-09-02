<script>
	import Icon from './Icon.svelte';
	let { title, description = '', icon = 'list', children = null } = $props();
</script>

<div class="empty-state">
	<div class="empty-icon"><Icon name={icon} size={26} /></div>
	<h3>{title}</h3>
	<p>{description}</p>
	{#if children}{@render children()}{/if}
</div>
