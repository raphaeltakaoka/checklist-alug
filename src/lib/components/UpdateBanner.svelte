<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import Icon from './Icon.svelte';
	import { updated } from '$app/state';

	let showBanner = $state(false);
	let registration = $state(null);

	onMount(() => {
		if (!('serviceWorker' in navigator)) return;

		// Listener to reload when the new service worker takes over
		let refreshing = false;
		navigator.serviceWorker.addEventListener('controllerchange', () => {
			if (!refreshing) {
				refreshing = true;
				window.location.reload();
			}
		});

		// Check service worker state and registration
		navigator.serviceWorker.ready.then((reg) => {
			registration = reg;

			// If there is already a waiting service worker (e.g. from previous session)
			if (reg.waiting) {
				showBanner = true;
			}

			// Listen for new installing service workers
			reg.addEventListener('updatefound', () => {
				const newWorker = reg.installing;
				if (newWorker) {
					newWorker.addEventListener('statechange', () => {
						if (
							newWorker.state === 'installed' &&
							navigator.serviceWorker.controller
						) {
							showBanner = true;
						}
					});
				}
			});
		});
	});

	// Reactively check SvelteKit's version update status
	$effect(() => {
		if (updated.current && registration) {
			registration.update();
		}
	});

	function triggerUpdate() {
		if (registration && registration.waiting) {
			registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		} else {
			window.location.reload();
		}
	}
</script>

{#if showBanner}
	<aside class="update-banner print-hidden" aria-label="Atualização disponível">
		<div class="inline">
			<Icon name="refresh" size={18} />
			<h3>Atualização disponível</h3>
		</div>
		<p>
			{page.url.pathname === '/dashboard/new'
				? 'Salve e saia da vistoria para atualizar o aplicativo.'
				: 'Atualize para usar a versão mais recente do Checklist.'}
		</p>
		<div class="inline" style="justify-content:flex-end">
			<button class="text-action" onclick={() => (showBanner = false)}
				>Mais tarde</button
			><button
				class="btn primary"
				disabled={page.url.pathname === '/dashboard/new'}
				onclick={triggerUpdate}>Atualizar</button
			>
		</div>
	</aside>
{/if}
