<script>
	import { onMount } from 'svelte';
	import { updated } from '$app/state';
	import { fade, fly } from 'svelte/transition';

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
						if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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
	<div 
		transition:fly={{ y: 50, duration: 400 }}
		class="fixed bottom-6 left-4 right-4 sm:left-auto sm:right-6 z-50 max-w-sm sm:w-96 bg-white/80 dark:bg-slate-900/80 backdrop-blur-lg border border-slate-200/60 dark:border-slate-800/60 p-4 rounded-2xl shadow-xl flex flex-col gap-3.5 print:hidden transform transition-all duration-300 hover:scale-[1.01]"
	>
		<div class="flex gap-3">
			<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-lg shadow-inner">
				✨
			</div>
			<div class="flex flex-col gap-0.5">
				<h4 class="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
					Atualização disponível
				</h4>
				<p class="text-xs text-slate-500 dark:text-slate-400 font-medium">
					Novos recursos e melhorias de desempenho estão prontos para você.
				</p>
			</div>
		</div>
		<div class="flex gap-2.5 justify-end">
			<button 
				onclick={() => (showBanner = false)}
				class="px-3.5 py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
			>
				Mais tarde
			</button>
			<button 
				onclick={triggerUpdate} 
				class="px-4.5 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-xs font-extrabold rounded-xl transition-all shadow-md shadow-slate-900/10 active:scale-[0.97] cursor-pointer"
			>
				Atualizar agora
			</button>
		</div>
	</div>
{/if}
