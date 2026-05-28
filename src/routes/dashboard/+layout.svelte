<script>
	import { goto } from '$app/navigation';
	import { authState } from '$lib/auth.svelte.js';

	let { children } = $props();

	// Protect dashboard route reactively when auth status is resolved
	$effect(() => {
		if (!authState.loading && !authState.user) {
			goto('/');
		}
	});
</script>

{#if authState.loading}
	<!-- Premium Ambient Glow loading state -->
	<div class="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans select-none">
		<div class="absolute w-[300px] h-[300px] rounded-full bg-blue-500/10 blur-[100px] top-[20%] left-[20%] pointer-events-none"></div>
		<div class="absolute w-[450px] h-[450px] rounded-full bg-indigo-500/10 blur-[120px] bottom-[20%] right-[20%] pointer-events-none"></div>
		
		<div class="z-10 flex flex-col items-center gap-4 text-center animate-pulse">
			<!-- Elegant Spinner -->
			<div class="relative w-14 h-14 flex items-center justify-center">
				<div class="absolute inset-0 rounded-full border-4 border-slate-100"></div>
				<div class="absolute inset-0 rounded-full border-4 border-blue-600 border-t-transparent animate-spin"></div>
			</div>
			
			<div class="space-y-1 mt-2">
				<h3 class="text-xs font-black text-slate-800 tracking-widest uppercase">Carregando Painel</h3>
				<p class="text-[10px] text-slate-400 font-medium">Verificando sessão segura com Firebase...</p>
			</div>
		</div>
	</div>
{:else if authState.user}
	{@render children()}
{/if}

