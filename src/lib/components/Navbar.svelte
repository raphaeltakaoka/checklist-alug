<script>
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import logo from '$lib/assets/logo_alug_locadora.png';
	import { auth } from '$lib/firebase.js';
	import { signOut } from 'firebase/auth';
	import { authState } from '$lib/auth.svelte.js';
	import { ui, notify } from '$lib/ui.svelte.js';
	import {
		enablePushNotifications,
		disablePushNotifications,
		isPushSupported
	} from '$lib/notifications';
	import { PUBLIC_FIREBASE_VAPID_KEY } from '$app/env/public';
	import Icon from './Icon.svelte';
	import Dialog from './Dialog.svelte';
	let focused = $derived(page.url.pathname === '/dashboard/new');
	let accountOpen = $state(false);
	let pushSupported = $state(false);
	let enabled = $state(false);
	let busy = $state(false);
	const links = [
		{ href: '/dashboard', label: 'Início', icon: 'home' },
		{ href: '/dashboard/checklists', label: 'Histórico', icon: 'list' },
		{ href: '/dashboard/tarefas', label: 'Tarefas', icon: 'tasks' }
	];
	onMount(async () => {
		pushSupported = await isPushSupported();
		if (pushSupported)
			enabled =
				Notification.permission === 'granted' &&
				localStorage.getItem('push_notifications_enabled') !== 'false';
	});
	async function toggleNotifications() {
		if (!PUBLIC_FIREBASE_VAPID_KEY) {
			notify('As notificações não estão disponíveis neste ambiente.', 'error');
			accountOpen = false;
			return;
		}
		busy = true;
		try {
			const success = enabled
				? await disablePushNotifications(PUBLIC_FIREBASE_VAPID_KEY)
				: await enablePushNotifications(PUBLIC_FIREBASE_VAPID_KEY);
			if (success) {
				enabled = !enabled;
				localStorage.setItem('push_notifications_enabled', String(enabled));
				notify(
					enabled ? 'Notificações ativadas.' : 'Notificações desativadas.',
					'success'
				);
			} else
				notify(
					'Não foi possível alterar as notificações. Verifique a permissão do navegador.',
					'error'
				);
		} catch {
			notify('Não foi possível alterar as notificações.', 'error');
		} finally {
			busy = false;
			accountOpen = false;
		}
	}
	async function logout() {
		busy = true;
		try {
			await signOut(auth);
			accountOpen = false;
			await goto('/');
		} catch {
			notify('Não foi possível sair. Tente novamente.', 'error');
		} finally {
			busy = false;
		}
	}
</script>

<header class="app-header print-hidden">
	<div class="header-inner">
		<a href="/dashboard" class="brand" aria-label="Checklist Alug — início"
			><img src={logo} alt="Alug" /><span class="brand-title">Checklist</span
			></a
		>
		{#if focused}
			<button
				class="text-action"
				disabled={ui.inspectionBusy || !ui.saveAndExit}
				onclick={() => ui.saveAndExit?.()}
				><Icon name="save" size={17} />Salvar e sair</button
			>
		{:else}
			<nav class="main-nav" aria-label="Navegação principal">
				{#each links as link}<a
						href={link.href}
						aria-current={(
							link.href === '/dashboard'
								? page.url.pathname === link.href
								: page.url.pathname.startsWith(link.href)
						)
							? 'page'
							: undefined}><Icon name={link.icon} size={19} />{link.label}</a
					>{/each}
			</nav>
			<button
				class="icon-button account-button"
				onclick={() => (accountOpen = true)}
				aria-label="Abrir menu da conta"
				>{authState.displayName.slice(0, 2).toUpperCase() || 'AL'}</button
			>
		{/if}
	</div>
</header>
{#if accountOpen}
	<Dialog title="Sua conta" onclose={() => (accountOpen = false)} {busy}>
		<div class="account-summary">
			<h3>{authState.displayName}</h3>
			<p class="muted">{authState.user?.email}</p>
		</div>
		{#if pushSupported}<button
				class="account-row"
				disabled={busy}
				onclick={toggleNotifications}
				><Icon name="bell" /><span>Notificações</span><small
					>{enabled ? 'Ativadas' : 'Desativadas'}</small
				></button
			>{/if}
		<button class="account-row" disabled={busy} onclick={logout}
			><Icon name="logout" /><span>Sair da conta</span></button
		>
	</Dialog>
{/if}
