<script>
	import { onMount } from 'svelte';
	import { PUBLIC_FIREBASE_VAPID_KEY } from '$app/env/public';
	import { enablePushNotifications, isPushSupported } from '$lib/notifications.js';
	import { notify } from '$lib/ui.svelte.js';

	let visible = $state(false);
	let busy = $state(false);
	let error = $state('');

	function rememberEnabled() {
		try {
			localStorage.setItem('push_notifications_enabled', 'true');
		} catch {
			/* Optional preference. */
		}
		window.dispatchEvent(new Event('checklist-push-enabled'));
	}

	onMount(() => {
		let cancelled = false;
		void (async () => {
			if (!PUBLIC_FIREBASE_VAPID_KEY || !(await isPushSupported()) || cancelled) return;
			let optedOut = false;
			let dismissed = false;
			try {
				optedOut = localStorage.getItem('push_notifications_enabled') === 'false';
				dismissed = sessionStorage.getItem('checklist-push-prompt-dismissed') === 'true';
			} catch {
				/* Permission still works without browser storage. */
			}
			if (optedOut) return;
			if (Notification.permission === 'granted') {
				const token = await enablePushNotifications(PUBLIC_FIREBASE_VAPID_KEY);
				if (token && !cancelled) rememberEnabled();
			} else if (Notification.permission === 'default' && !cancelled) {
				visible = !dismissed;
			}
		})().catch(() => {});
		return () => {
			cancelled = true;
		};
	});

	function dismiss() {
		visible = false;
		try {
			sessionStorage.setItem('checklist-push-prompt-dismissed', 'true');
		} catch {
			/* Optional preference. */
		}
	}

	async function enable() {
		if (busy) return;
		busy = true;
		error = '';
		// This call must remain inside the click handler for Safari/iOS user activation.
		const token = await enablePushNotifications(PUBLIC_FIREBASE_VAPID_KEY);
		if (token) {
			rememberEnabled();
			visible = false;
			notify('Notificações ativadas.', 'success');
		} else {
			error = 'Não foi possível ativar. Verifique a permissão do navegador e tente novamente.';
		}
		busy = false;
	}
</script>

{#if visible}
	<aside class="push-prompt print-hidden" aria-label="Ativar notificações">
		<div>
			<h2>Receba avisos de novas tarefas</h2>
			<p>Ative as notificações do Checklist Alug neste dispositivo.</p>
			{#if error}<p class="push-error" role="alert">{error}</p>{/if}
		</div>
		<div class="push-actions">
			<button type="button" class="btn" disabled={busy} onclick={dismiss}>Agora não</button>
			<button type="button" class="btn primary" disabled={busy} onclick={enable}>
				{busy ? 'Ativando…' : 'Ativar notificações'}
			</button>
		</div>
	</aside>
{/if}

<style>
	.push-prompt {
		position: fixed;
		inset-inline: 16px;
		bottom: max(16px, env(safe-area-inset-bottom));
		z-index: 60;
		max-width: 480px;
		margin-inline: auto;
		padding: 20px;
		border: 1px solid var(--border);
		border-radius: 16px;
		background: var(--surface);
		box-shadow: 0 12px 40px #20252326;
	}
	p {
		margin-top: 8px;
		color: var(--muted);
		font-size: 0.9rem;
	}
	.push-actions {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 16px;
		flex-wrap: wrap;
	}
	.push-error {
		color: #9f3030;
	}
</style>
