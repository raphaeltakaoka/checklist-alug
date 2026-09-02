<script>
	import { onDestroy } from 'svelte';
	import { compressImage } from '$lib/utils/imageCompressor.js';
	import { mediaPreviewUrl, revokeMediaPreview } from '$lib/mediaPreview.js';
	import { STATUS_LABELS } from '$lib/inspection.js';
	import Icon from './Icon.svelte';
	import Notice from './Notice.svelte';
	import Dialog from './Dialog.svelte';
	let {
		partId = $bindable(),
		partStates = $bindable(),
		partName = ''
	} = $props();
	let status = $state('none');
	let comments = $state('');
	let photos = $state([]);
	let initial;
	let dirty = $state(false);
	let processing = $state(false);
	let error = $state('');
	let discard = $state(false);
	let preview = $state(null);
	let camera;
	let gallery;
	let alive = true;
	let initialized = false;
	let otherCount = $derived(
		Object.entries(partStates).reduce(
			(sum, [key, part]) =>
				sum + (key === partId ? 0 : part.photos?.length || 0),
			0
		)
	);
	let remaining = $derived(
		Math.max(0, Math.min(6 - photos.length, 24 - otherCount - photos.length))
	);
	let invalidNone = $derived(
		status === 'none' && (!!comments.trim() || photos.length > 0)
	);
	$effect(() => {
		if (!initialized && partId) {
			initial = partStates[partId] || {
				status: 'none',
				comments: '',
				photos: []
			};
			status = initial.status;
			comments = initial.comments || '';
			photos = [...(initial.photos || [])];
			initialized = true;
		}
	});
	function close() {
		if (processing) return;
		if (dirty) discard = true;
		else partId = null;
	}
	function save() {
		if (processing || invalidNone) return;
		partStates = {
			...partStates,
			[partId]: { status, comments, photos: [...photos] }
		};
		partId = null;
	}
	async function upload(event) {
		const files = Array.from(event.target.files || []);
		if (!files.length || processing) return;
		const capacity = remaining;
		processing = true;
		error = '';
		if (files.length > capacity)
			error = `Você pode adicionar mais ${capacity} ${capacity === 1 ? 'foto' : 'fotos'} nesta peça. Limite: 6 por peça e 24 por vistoria.`;
		try {
			for (const file of files.slice(0, capacity)) {
				try {
					const image = await compressImage(file, {
						maxWidth: 1280,
						maxHeight: 1280,
						quality: 0.82
					});
					if (!alive) return;
					photos = [...photos, image];
					dirty = true;
				} catch (cause) {
					error =
						cause?.message ||
						'Não foi possível preparar a foto. Tente outra imagem.';
				}
			}
		} finally {
			processing = false;
			event.target.value = '';
		}
	}
	onDestroy(() => {
		alive = false;
		for (const photo of photos) revokeMediaPreview(photo);
	});
</script>

<Dialog title={partName} onclose={close} busy={processing}>
	<div class="stack">
		<Notice message={error} />
		<div class="field">
			<span class="field-label" id="damage-label">Condição da peça</span>
			<div class="choice-grid" aria-labelledby="damage-label">
				{#each Object.entries(STATUS_LABELS) as [value, label]}<button
						type="button"
						disabled={processing}
						aria-pressed={status === value}
						onclick={() => {
							status = value;
							dirty = true;
						}}>{label}</button
					>{/each}
			</div>
		</div>
		<div class="field">
			<label for="damage-comments"
				>Observações <span class="muted">· opcional</span></label
			><textarea
				id="damage-comments"
				bind:value={comments}
				oninput={() => (dirty = true)}
				disabled={processing}
				maxlength="1000"
				rows="3"
				placeholder="Descreva o dano e a localização"></textarea><span
				class="muted">{comments.length}/1.000 caracteres</span
			>
		</div>
		<div class="field">
			<span class="field-label">Fotos · {photos.length}/6</span>
			{#if photos.length}<div class="photo-grid">
					{#each photos as photo, index}<div class="photo-tile">
							<button
								aria-label={`Ampliar foto ${index + 1}`}
								onclick={() => (preview = photo)}
								><img
									src={mediaPreviewUrl(photo)}
									alt={`Foto ${index + 1} de ${partName}`}
								/></button
							><button
								class="icon-button"
								disabled={processing}
								aria-label={`Remover foto ${index + 1}`}
								onclick={() => {
									revokeMediaPreview(photo);
									photos = photos.filter((_, i) => i !== index);
									dirty = true;
								}}><Icon name="trash" size={17} /></button
							>
						</div>{/each}
				</div>{/if}
			<div class="upload-controls">
				<button
					class="btn"
					disabled={processing || !remaining}
					onclick={() => camera.click()}
					><Icon name="camera" />{processing
						? 'Preparando…'
						: 'Tirar foto'}</button
				><button
					class="btn"
					disabled={processing || !remaining}
					onclick={() => gallery.click()}><Icon name="image" />Galeria</button
				>
			</div>
			<input
				class="sr-only"
				tabindex="-1"
				bind:this={camera}
				type="file"
				accept="image/*"
				capture="environment"
				onchange={upload}
				aria-label="Fotografar dano"
			/><input
				class="sr-only"
				tabindex="-1"
				bind:this={gallery}
				type="file"
				multiple
				accept="image/*"
				onchange={upload}
				aria-label="Escolher fotos do dano"
			/>
			<p class="field-help">
				{otherCount + photos.length}/24 fotos na vistoria.{remaining === 0
					? ' Limite de fotos atingido.'
					: ''}
			</p>
		</div>
		{#if invalidNone}<Notice
				message="Selecione o tipo de dano para salvar fotos ou observações."
			/>{/if}
	</div>
	{#snippet footer()}<button class="btn" disabled={processing} onclick={close}
			>Cancelar</button
		><button
			class="btn primary"
			disabled={processing || invalidNone}
			onclick={save}><Icon name="check" size={17} />Salvar peça</button
		>{/snippet}
</Dialog>
{#if discard}<Dialog
		title="Descartar alterações da peça?"
		onclose={() => (discard = false)}
		><p>As alterações desta peça ainda não foram salvas.</p>
		{#snippet footer()}<button class="btn" onclick={() => (discard = false)}
				>Continuar editando</button
			><button class="btn danger" onclick={() => (partId = null)}
				>Descartar</button
			>{/snippet}</Dialog
	>{/if}
{#if preview}<Dialog title="Foto do dano" wide onclose={() => (preview = null)}
		><img
			class="preview-image"
			src={mediaPreviewUrl(preview)}
			alt={`Detalhe de ${partName}`}
		/></Dialog
	>{/if}
