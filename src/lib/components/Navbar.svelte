<script>
	import { goto } from "$app/navigation";
	import logo from "$lib/assets/logo_alug_locadora.png";
	import { auth } from "$lib/firebase.js";
	import { signOut } from "firebase/auth";
	import { fade, fly } from "svelte/transition";

	let { showDashboard = false } = $props();
	let isMenuOpen = $state(false);

	async function handleSignOut() {
		try {
			await signOut(auth);
			// auth.svelte.js onAuthStateChanged listener handles localStorage cleanup reactively
			goto("/");
		} catch (error) {
			console.error("Erro ao fazer logout:", error);
		}
	}
</script>

<!-- Top Premium Navbar -->
<header
	class="border-b border-slate-200 bg-white/70 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-4 flex justify-between items-center print:hidden"
>
	<div class="flex items-center gap-3">
		<!-- Hamburger Menu Trigger -->
		<button
			onclick={() => (isMenuOpen = true)}
			class="p-2 hover:bg-slate-100 :bg-slate-800 text-slate-600 hover:text-slate-900 :text-white rounded-xl transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200 :border-slate-700 shadow-2xs hover:shadow-xs"
			aria-label="Abrir menu"
		>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2.2"
					d="M4 6h16M4 12h16M4 18h16"
				/>
			</svg>
		</button>

		<div
			class="flex items-center justify-center p-1 bg-white rounded-lg border border-slate-150 shadow-xs"
		>
			<img
				src={logo}
				alt="Checklist Alug Logo"
				class="h-8 w-auto object-contain"
			/>
		</div>
		<div>
			<h1
				class="text-md font-extrabold tracking-tight text-slate-900 leading-none"
			>
				Checklist Alug
			</h1>
		</div>
	</div>

	<div class="flex items-center gap-2">
		{#if showDashboard}
			<button
				onclick={() => goto("/dashboard")}
				class="px-3 sm:px-4 py-2 text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 hover:text-slate-900 :text-white rounded-xl transition-all cursor-pointer font-medium"
			>
				Painel
			</button>
		{/if}
	</div>
</header>

<!-- Sliding Menu Drawer System -->
{#if isMenuOpen}
	<!-- Backdrop Overlay -->
	<div
		onclick={() => (isMenuOpen = false)}
		onkeydown={(e) => e.key === "Escape" && (isMenuOpen = false)}
		role="button"
		tabindex="0"
		transition:fade={{ duration: 200 }}
		class="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-xs cursor-pointer print:hidden"
		aria-label="Fechar menu"
	></div>

	<!-- Drawer panel -->
	<div
		transition:fly={{ x: -300, duration: 300 }}
		class="fixed top-0 left-0 bottom-0 z-50 w-72 max-w-[80vw] bg-white shadow-2xl border-r border-slate-200 flex flex-col print:hidden"
	>
		<!-- Drawer Header -->
		<div
			class="p-5 border-b border-slate-150 flex items-center justify-between"
		>
			<div class="flex items-center gap-3">
				<div
					class="flex items-center justify-center p-1 bg-white rounded-lg border border-slate-150 shadow-xs"
				>
					<img
						src={logo}
						alt="Checklist Alug Logo"
						class="h-7 w-auto object-contain"
					/>
				</div>
				<h2
					class="text-xs font-black tracking-widest text-slate-400 uppercase"
				>
					Menu
				</h2>
			</div>

			<!-- Premium Close Button -->
			<button
				onclick={() => (isMenuOpen = false)}
				class="p-2 hover:bg-slate-100 :bg-slate-800 text-slate-400 hover:text-slate-700 :text-slate-200 rounded-xl transition-all cursor-pointer flex items-center justify-center border border-transparent hover:border-slate-200 :border-slate-750"
				aria-label="Fechar menu"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2.5"
						d="M6 18L18 6M6 6l12 12"
					/>
				</svg>
			</button>
		</div>

		<!-- Menu Items Navigation Links -->
		<nav class="flex-1 p-5 space-y-3 overflow-y-auto">
			<button
				onclick={() => {
					isMenuOpen = false;
					goto("/dashboard");
				}}
				class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-slate-700 hover:text-primary bg-slate-50 hover:bg-slate-100 border border-slate-200/50 hover:border-slate-350 font-bold transition-all text-sm text-left cursor-pointer group active:scale-[0.98]"
			>
				<span
					class="text-base group-hover:scale-110 transition-transform"
					>🏠</span
				>
				<span>Inicial</span>
			</button>

			<button
				onclick={() => {
					isMenuOpen = false;
					goto("/dashboard/checklists");
				}}
				class="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-slate-700 hover:text-primary bg-slate-50 hover:bg-slate-100 border border-slate-200/50 hover:border-slate-350 font-bold transition-all text-sm text-left cursor-pointer group active:scale-[0.98]"
			>
				<span
					class="text-base group-hover:scale-110 transition-transform"
					>📋</span
				>
				<span>Checklists</span>
			</button>
		</nav>

		<!-- Bottom Exit Action -->
		<div
			class="p-5 border-t border-slate-150 bg-slate-500/5"
		>
			<button
				onclick={handleSignOut}
				class="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-2xl text-red-600 hover:text-white bg-red-50 hover:bg-red-650 border border-red-100 hover:border-red-650 font-extrabold transition-all text-sm cursor-pointer group active:scale-[0.98] shadow-xs hover:shadow-md hover:shadow-red-500/10"
			>
				<span
					class="text-base group-hover:scale-110 transition-transform"
					>🚪</span
				>
				<span>Sair do Sistema</span>
			</button>
		</div>
	</div>
{/if}

