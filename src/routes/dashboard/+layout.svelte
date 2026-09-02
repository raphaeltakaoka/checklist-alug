<script>
	import { goto } from '$app/navigation';
	import { authState } from '$lib/auth.svelte.js';
	import { ui } from '$lib/ui.svelte.js';
	import Navbar from '$lib/components/Navbar.svelte';
	import Notice from '$lib/components/Notice.svelte';
	let { children } = $props();
	$effect(() => {
		if (!authState.loading && !authState.user) goto('/');
	});
</script>

{#if authState.loading}
	<div class="loading-page" role="status">
		<span class="spinner"></span>
		<p>Carregando sua conta…</p>
	</div>
{:else if authState.user}
	<Navbar />
	{#if ui.notice}<div class="global-notice">
			<Notice
				message={ui.notice.message}
				type={ui.notice.type}
				ondismiss={() => (ui.notice = null)}
			/>
		</div>{/if}
	{@render children()}
{/if}
