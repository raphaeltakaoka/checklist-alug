<script>
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import { goto } from '$app/navigation';
	import logo from '$lib/assets/logo_alug_locadora.png';
	import { auth } from '$lib/firebase.js';
	import { signInWithEmailAndPassword } from 'firebase/auth';
	import { authState } from '$lib/auth.svelte.js';

	let email = $state('');
	let password = $state('');
	let showPassword = $state(false);
	let isLoading = $state(false);
	let hasError = $state(false);
	let errorMessage = $state('');

	$effect(() => {
		if (!authState.loading && authState.user) {
			goto('/dashboard');
		}
	});

	async function handleLogin(e) {
		e.preventDefault();
		if (isLoading) return;
		hasError = false;
		errorMessage = '';
		isLoading = true;

		const trimmedEmail = email.trim().toLowerCase();

		try {
			// Authenticate via Firebase
			const userCredential = await signInWithEmailAndPassword(
				auth,
				trimmedEmail,
				password
			);
			const user = userCredential.user;

			// Verify custom claims roles
			const idTokenResult = await user.getIdTokenResult(true);
			const roles = idTokenResult.claims?.roles;
			const canUseChecklist =
				(Array.isArray(roles?.operations) &&
					roles.operations.includes('read')) ||
				(Array.isArray(roles?.administrator) &&
					roles.administrator.includes('read'));

			if (!canUseChecklist) {
				await auth.signOut();
				errorMessage =
					'Acesso negado. Esta conta não possui permissão de leitura do Checklist.';
				hasError = true;
				isLoading = false;
				return;
			}

			goto('/dashboard');
		} catch (error) {
			console.error('Firebase Auth Error:', error.code, error.message);

			// User-friendly error translations
			switch (error.code) {
				case 'auth/invalid-credential':
				case 'auth/wrong-password':
				case 'auth/user-not-found':
					errorMessage =
						'E-mail ou senha incorretos. Por favor, verifique suas credenciais.';
					break;
				case 'auth/invalid-email':
					errorMessage = 'O formato do e-mail inserido é inválido.';
					break;
				case 'auth/user-disabled':
					errorMessage =
						'Esta conta de usuário foi desativada pela administração.';
					break;
				case 'auth/too-many-requests':
					errorMessage =
						'Muitas tentativas malsucedidas de acesso. Tente novamente mais tarde.';
					break;
				default:
					errorMessage =
						'Erro de autenticação: ' + (error.message || error.code);
			}

			hasError = true;
			isLoading = false;
		}
	}
</script>

<svelte:head
	><title>Entrar · Checklist Alug</title><meta
		name="description"
		content="Vistorias de veículos com fotos, assinatura e acesso offline."
	/></svelte:head
>
<div class="login-page">
	<div class="login-top">
		<img src={logo} alt="Alug" /><span class="brand-title">Checklist</span>
	</div>
	<main class="login-wrap">
		<span class="eyebrow">Portal do inspetor</span>
		<h1>Pronto para a próxima vistoria.</h1>
		<p>
			Acesse sua conta para iniciar uma vistoria ou continuar de onde parou.
		</p>
		<form onsubmit={handleLogin} class="stack">
			<Notice message={errorMessage} />
			<div class="field">
				<label for="login-email">E-mail</label><input
					id="login-email"
					type="email"
					autocomplete="username"
					bind:value={email}
					placeholder="voce@empresa.com.br"
					required
					disabled={isLoading}
				/>
			</div>
			<div class="field">
				<label for="login-pwd">Senha</label>
				<div class="password-field">
					<input
						id="login-pwd"
						type={showPassword ? 'text' : 'password'}
						autocomplete="current-password"
						bind:value={password}
						placeholder="Sua senha"
						required
						disabled={isLoading}
					/><button
						type="button"
						class="icon-button"
						onclick={() => (showPassword = !showPassword)}
						aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
						aria-pressed={showPassword}><Icon name="eye" /></button
					>
				</div>
			</div>
			<button class="btn primary full" disabled={isLoading} type="submit"
				>{#if isLoading}<span class="spinner"></span>Entrando…{:else}Entrar<Icon
						name="arrow"
						size={18}
					/>{/if}</button
			>
		</form>
	</main>
	<p class="login-footer">Alug Locadora · Checklist de veículos</p>
</div>
