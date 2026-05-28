<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import logo from '$lib/assets/logo_alug_locadora.png';
	import { auth } from '$lib/firebase.js';
	import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isLoading = $state(false);
	let hasError = $state(false);
	let errorMessage = $state('');

	onMount(() => {
		if (localStorage.getItem('authenticated') === 'true') {
			goto('/dashboard');
		}
	});

	async function handleLogin(e) {
		e.preventDefault();
		hasError = false;
		errorMessage = '';
		isLoading = true;

		const trimmedEmail = email.trim().toLowerCase();

		try {
			// Authenticate via Firebase
			const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);
			const user = userCredential.user;

			// Sync localStorage for compatibility
			localStorage.setItem('authenticated', 'true');
			localStorage.setItem('inspectorName', user.displayName || user.email.split('@')[0]);

			goto('/dashboard');
		} catch (error) {
			console.error("Firebase Auth Error:", error.code, error.message);

			// Automatically provision default demo credentials if they don't exist yet
			if (trimmedEmail === 'test@test.com' && password === '123456' && 
				(error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential')) {
				try {
					const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
					const { updateProfile } = await import('firebase/auth');
					await updateProfile(userCredential.user, { displayName: "Carlos Souza" });

					// Sync localStorage for compatibility
					localStorage.setItem('authenticated', 'true');
					localStorage.setItem('inspectorName', 'Carlos Souza');

					goto('/dashboard');
					return;
				} catch (createError) {
					console.error("Failed to auto-create demo user:", createError);
				}
			}

			// User-friendly error translations
			switch (error.code) {
				case 'auth/invalid-credential':
				case 'auth/wrong-password':
				case 'auth/user-not-found':
					errorMessage = 'E-mail ou senha incorretos. Por favor, verifique suas credenciais.';
					break;
				case 'auth/invalid-email':
					errorMessage = 'O formato do e-mail inserido é inválido.';
					break;
				case 'auth/user-disabled':
					errorMessage = 'Esta conta de usuário foi desativada pela administração.';
					break;
				case 'auth/too-many-requests':
					errorMessage = 'Muitas tentativas malsucedidas de acesso. Tente novamente mais tarde.';
					break;
				default:
					errorMessage = 'Erro de autenticação: ' + (error.message || error.code);
			}

			hasError = true;
			isLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Checklist Alug - Acesso ao Sistema</title>
	<meta name="description" content="Acesse a suíte de inspeção e auditoria digital de veículos Checklist Alug." />
</svelte:head>

<div class="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans select-none">
	<!-- Background Ambient Glows -->
	<div class="absolute w-[400px] h-[400px] rounded-full bg-blue-500/5 blur-[120px] top-[-10%] left-[-10%] pointer-events-none"></div>
	<div class="absolute w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-[150px] bottom-[-20%] right-[-10%] pointer-events-none"></div>

	<!-- Login Card Wrapper -->
	<div class="w-full max-w-md z-10 transition-all duration-300">
		
		<!-- Branding / Logo Header -->
		<div class="text-center mb-8 space-y-3">
			<div class="inline-flex items-center justify-center p-2 rounded-2xl bg-white shadow-xl shadow-slate-200/50 border border-slate-100">
				<img src={logo} alt="Checklist Alug Logo" class="h-12 w-auto object-contain" />
			</div>
			<div>
				<h1 class="text-2xl font-black tracking-tight text-slate-950 leading-none">Checklist Alug</h1>
				<span class="text-[10px] text-slate-400 font-bold tracking-widest uppercase mt-2 block">Portal do Inspetor</span>
			</div>
		</div>

		<!-- Card Body -->
		<div class="bg-white/90 border border-slate-200/80 shadow-2xl shadow-slate-200/50 rounded-3xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
			<div class="text-center space-y-1">
				<h2 class="text-lg font-bold text-slate-800">Acesse sua Conta</h2>
				<p class="text-xs text-slate-500">Insira suas credenciais para gerenciar vistorias.</p>
			</div>

			<!-- Error Box with transition -->
			{#if hasError}
				<div class="bg-red-50 border border-red-100 rounded-2xl p-4 flex gap-3 items-start text-xs text-red-650 animate-shake">
					<span class="text-lg leading-none">⚠️</span>
					<div>
						<p class="font-bold text-red-800">Erro de Login</p>
						<p class="mt-0.5 text-red-600/90">{errorMessage}</p>
					</div>
				</div>
			{/if}

			<!-- Login Form -->
			<form onsubmit={handleLogin} class="space-y-4">
				
				<!-- Email Input -->
				<div class="space-y-1.5">
					<label class="block text-xs font-semibold text-slate-650" for="login-email">
						Endereço de E-mail
					</label>
					<div class="relative">
						<span class="absolute inset-y-0 left-4 flex items-center text-slate-400">
							✉️
						</span>
						<input 
							id="login-email"
							type="email"
							bind:value={email}
							placeholder="nome@checklistalug.com.br"
							required
							class="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-2xl pl-11 pr-4 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400"
							disabled={isLoading}
						/>
					</div>
				</div>

				<!-- Password Input -->
				<div class="space-y-1.5">
					<div class="flex justify-between items-center">
						<label class="block text-xs font-semibold text-slate-650" for="login-pwd">
							Senha
						</label>
					</div>
					<div class="relative">
						<span class="absolute inset-y-0 left-4 flex items-center text-slate-400">
							🔒
						</span>
						<input 
							id="login-pwd"
							type={showPassword ? 'text' : 'password'}
							bind:value={password}
							placeholder="Sua senha"
							required
							class="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:bg-white rounded-2xl pl-11 pr-12 py-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 font-sans"
							disabled={isLoading}
						/>
						<button 
							type="button" 
							onclick={() => showPassword = !showPassword}
							class="absolute inset-y-0 right-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors text-sm cursor-pointer"
							title={showPassword ? 'Ocultar senha' : 'Exibir senha'}
						>
							{showPassword ? '👁' : '👁️‍🗨️'}
						</button>
					</div>
				</div>

				<!-- Keep Connected Checkbox -->
				<div class="flex items-center justify-between text-xs pt-1">
					<label class="flex items-center gap-2 text-slate-500 cursor-pointer select-none">
						<input 
							type="checkbox" 
							checked
							class="w-4 h-4 rounded-lg bg-white border-slate-200 text-blue-600 focus:ring-0 focus:ring-offset-0 focus:outline-none transition-all"
						/>
						<span>Manter conectado neste dispositivo</span>
					</label>
				</div>

				<!-- Submit Button -->
				<button 
					type="submit"
					disabled={isLoading}
					class="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-extrabold rounded-2xl transition-all shadow-lg shadow-blue-500/10 hover:shadow-blue-500/20 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 cursor-pointer mt-6 text-sm"
				>
					{#if isLoading}
						<svg class="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						<span>Autenticando...</span>
					{:else}
						<span>Entrar no Sistema</span>
					{/if}
				</button>
			</form>

			<!-- Mock Credentials Helper Card -->
			<div class="bg-blue-50/50 border border-blue-100 rounded-2xl p-4 space-y-2">
				<div class="flex items-center gap-2 text-xs font-bold text-blue-600">
					💡 <span>Dados de Demonstração</span>
				</div>
				<div class="grid grid-cols-2 gap-y-1 gap-x-2 text-[11px] text-slate-500 font-mono">
					<span class="text-slate-400">E-mail:</span>
					<span class="text-slate-700 font-bold select-all">test@test.com</span>
					
					<span class="text-slate-400">Senha:</span>
					<span class="text-slate-700 font-bold select-all">123456</span>
				</div>
			</div>
		</div>

		<!-- Footer Meta -->
		<p class="text-center text-[10px] text-slate-400 mt-8">
			© 2026 Checklist Alug. Executando localmente no navegador. Todos os dados permanecem salvos em seu dispositivo.
		</p>
	</div>
</div>

<style>
	/* Subtle Shake Animation for Errors */
	@keyframes shake {
		0%, 100% { transform: translateX(0); }
		20%, 60% { transform: translateX(-4px); }
		40%, 80% { transform: translateX(4px); }
	}
	.animate-shake {
		animation: shake 0.4s ease-in-out;
	}
</style>
