<script>
	import { onMount, tick } from 'svelte';
	import { beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { authState } from '$lib/auth.svelte.js';
	import { ui } from '$lib/ui.svelte.js';
	import {
		getInspection,
		getStorageEstimate,
		requestPersistentStorage,
		saveInspection
	} from '$lib/db.js';
	import { compressImage } from '$lib/utils/imageCompressor.js';
	import { mediaPreviewUrl, revokeMediaPreview } from '$lib/mediaPreview.js';
	import {
		PART_NAMES,
		STATUS_LABELS,
		countDamages,
		formatMileage
	} from '$lib/inspection.js';
	import {
		createInspectionWriter,
		inspectionErrors,
		firstErrorStep
	} from '$lib/inspectionForm.js';
	import Icon from '$lib/components/Icon.svelte';
	import Notice from '$lib/components/Notice.svelte';
	import Dialog from '$lib/components/Dialog.svelte';
	import CarDiagram from '$lib/components/CarDiagram.svelte';
	import DamageModal from '$lib/components/DamageModal.svelte';
	import SignaturePad from '$lib/components/SignaturePad.svelte';
	let report = $state({
		id: 'ins-' + crypto.randomUUID(),
		ownerUid: '',
		licensePlate: '',
		inspectionType: 'Entrega',
		inspectorName: '',
		clientName: '',
		inspectionDateTime: '',
		clientLicensePhoto: null,
		clientSignature: null,
		carDiagramImage: null,
		mileage: '',
		fuelLevel: '4/8',
		hasDocument: false,
		hasChildSeat: false,
		hasEToll: false,
		partStates: {},
		createdAt: new Date().toISOString()
	});
	let step = $state(1);
	let hydrated = $state(false);
	let loadError = $state('');
	let errors = $state({});
	let saveState = $state('idle');
	let saveError = $state('');
	let storageWarning = $state('');
	let busy = $state(false);
	let processing = $state(false);
	let photoError = $state('');
	let activePart = $state(null);
	let damageView = $state('map');
	let diagram = $state(null);
	let formRoot;
	let cameraInput = $state(null);
	let galleryInput = $state(null);
	let writer;
	let allowLeave = false;
	let leaveTarget = $state(null);
	let discardOpen = $state(false);
	let alive = true;
	let eligible = $derived(
		report.licensePlate.length === 7 && !!report.clientName.trim()
	);
	let photoCount = $derived(
		Object.values(report.partStates).reduce(
			(sum, part) => sum + (part.photos?.length || 0),
			0
		)
	);
	const steps = ['Detalhes', 'Interior', 'Danos', 'Conclusão'];
	function snapshot(status = 'draft') {
		return {
			...$state.snapshot(report),
			status,
			syncState: status === 'completed' ? 'queued' : 'draft',
			synced: false,
			retryCount: 0,
			lastSyncError: ''
		};
	}
	function captureDiagram() {
		const image = diagram?.capture?.();
		if (image) {
			revokeMediaPreview(report.carDiagramImage);
			report.carDiagramImage = image;
		}
	}
	async function focusError() {
		await tick();
		formRoot
			?.querySelector('[aria-invalid="true"], [data-invalid="true"]')
			?.focus();
	}
	async function persist() {
		if (!eligible) {
			errors = inspectionErrors(report, 1);
			step = 1;
			await focusError();
			return false;
		}
		captureDiagram();
		try {
			await writer.flush(snapshot());
			return true;
		} catch {
			return false;
		}
	}
	async function navigateStep(next) {
		if (busy || processing || !hydrated || next === step) return;
		errors = next > step ? inspectionErrors(report, next - 1) : {};
		if (Object.keys(errors).length) {
			step = firstErrorStep(errors);
			await focusError();
			return;
		}
		busy = true;
		try {
			if (await persist()) {
				step = next;
				await tick();
				document.getElementById('step-title')?.focus();
				window.scrollTo({ top: 0, behavior: 'instant' });
			}
		} finally {
			busy = false;
		}
	}
	async function leave(target = '/dashboard') {
		if (busy || processing) return;
		if (!hydrated) {
			allowLeave = true;
			await goto(target);
			return;
		}
		if (!eligible) {
			if (report.licensePlate || report.clientName) {
				leaveTarget = target;
				discardOpen = true;
				return;
			}
			allowLeave = true;
			await goto(target);
			return;
		}
		busy = true;
		try {
			if (await persist()) {
				allowLeave = true;
				await goto(target);
			}
		} finally {
			busy = false;
		}
	}
	beforeNavigate((navigation) => {
		if (allowLeave || !hydrated) return;
		if (navigation.willUnload) {
			if (
				saveState === 'saving' ||
				saveState === 'unsaved' ||
				saveState === 'error' ||
				(!eligible && (report.licensePlate || report.clientName))
			)
				navigation.cancel();
			return;
		}
		if (navigation.to?.url.href !== page.url.href) {
			navigation.cancel();
			leave(navigation.to?.url.href || '/dashboard');
		}
	});
	async function complete() {
		if (busy || processing) return;
		errors = inspectionErrors(report, 4);
		if (Object.keys(errors).length) {
			step = firstErrorStep(errors);
			await focusError();
			return;
		}
		busy = true;
		try {
			captureDiagram();
			await writer.complete(snapshot('completed'));
			allowLeave = true;
			await goto(`/dashboard?completed=${encodeURIComponent(report.id)}`);
		} catch {
			/* The writer exposes a persistent, retryable error. */
		} finally {
			busy = false;
		}
	}
	async function uploadLicense(event) {
		const file = event.target.files?.[0];
		if (!file || processing) return;
		processing = true;
		photoError = '';
		try {
			const image = await compressImage(file, {
				maxWidth: 1600,
				maxHeight: 1600,
				quality: 0.85
			});
			if (!alive) return;
			revokeMediaPreview(report.clientLicensePhoto);
			report.clientLicensePhoto = image;
			errors = { ...errors, clientLicensePhoto: '' };
		} catch (error) {
			photoError =
				error?.message ||
				'Não foi possível preparar a foto. Tente outra imagem.';
		} finally {
			processing = false;
			event.target.value = '';
		}
	}
	onMount(() => {
		alive = true;
		writer = createInspectionWriter(saveInspection, (state, error) => {
			saveState = state;
			saveError =
				state === 'error'
					? error?.message ||
						'Não foi possível salvar. Mantenha esta página aberta e tente novamente.'
					: '';
		});
		ui.saveAndExit = () => leave();
		const initialize = async () => {
			const now = new Date();
			report.inspectionDateTime = new Date(
				now.getTime() - now.getTimezoneOffset() * 60000
			)
				.toISOString()
				.slice(0, 16);
			report.ownerUid = authState.user.uid;
			report.inspectorName = authState.displayName;
			const draftId = page.url.searchParams.get('id');
			if (draftId) {
				try {
					const draft = await getInspection(authState.user.uid, draftId);
					if (!draft) {
						loadError = 'Este rascunho não está disponível neste dispositivo.';
						return;
					}
					if (draft.status !== 'draft') {
						allowLeave = true;
						await goto(`/dashboard/new/${encodeURIComponent(draftId)}`);
						return;
					}
					if (!alive) return;
					report = {
						...report,
						...draft,
						mileage: formatMileage(draft.mileage)
					};
					saveState = 'saved';
				} catch {
					loadError =
						'Não foi possível abrir o rascunho. Volte ao início e tente novamente.';
					return;
				}
			}
			if (!alive) return;
			hydrated = true;
			requestPersistentStorage().catch(() => false);
			getStorageEstimate()
				.then((estimate) => {
					if (alive && estimate?.ratio > 0.85)
						storageWarning =
							'O armazenamento deste dispositivo está quase cheio. Sincronize suas vistorias antes de continuar.';
				})
				.catch(() => {});
		};
		initialize();
		const flush = () => {
			if (hydrated && eligible && !allowLeave)
				writer.flush(snapshot()).catch(() => {});
		};
		const hidden = () => {
			if (document.visibilityState === 'hidden') flush();
		};
		document.addEventListener('visibilitychange', hidden);
		window.addEventListener('pagehide', flush);
		return () => {
			alive = false;
			writer.dispose();
			ui.saveAndExit = null;
			ui.inspectionBusy = false;
			document.removeEventListener('visibilitychange', hidden);
			window.removeEventListener('pagehide', flush);
			revokeMediaPreview(report.clientLicensePhoto);
			revokeMediaPreview(report.carDiagramImage);
		};
	});
	$effect(() => {
		const current = $state.snapshot(report);
		if (!hydrated || allowLeave) return;
		if (current.licensePlate.length === 7 && current.clientName.trim()) {
			writer?.schedule(() => (eligible ? snapshot() : null));
		} else {
			writer?.cancelScheduled();
			saveState =
				current.licensePlate || current.clientName ? 'unsaved' : 'idle';
		}
	});

	$effect(() => {
		ui.inspectionBusy = busy || processing || !!activePart;
	});
	$effect(() => {
		const currentErrors = inspectionErrors(report, 4);
		const remaining = Object.fromEntries(
			Object.entries(errors).filter(
				([key, message]) => message && currentErrors[key]
			)
		);
		if (Object.keys(remaining).length !== Object.keys(errors).length)
			errors = remaining;
	});
</script>

<svelte:head
	><title
		>{page.url.searchParams.has('id') ? 'Continuar vistoria' : 'Nova vistoria'} ·
		Checklist Alug</title
	></svelte:head
>
<main class="page narrow inspection-form" bind:this={formRoot}>
	<div class="page-heading">
		<div>
			<div class="eyebrow">
				{report.licensePlate || 'Checklist de veículos'}
			</div>
			<h1>
				{page.url.searchParams.has('id')
					? 'Continuar vistoria'
					: 'Nova vistoria'}
			</h1>
		</div>
		<span class="badge">Etapa {step} de 4</span>
	</div>
	{#if loadError}<Notice message={loadError} /><a
			class="btn section"
			href="/dashboard">Voltar ao início</a
		>
	{:else if !hydrated}<div class="loading-page" role="status">
			<span class="spinner"></span>Preparando vistoria…
		</div>
	{:else}
		<nav class="stepper" aria-label="Etapas da vistoria">
			{#each steps as label, index}<button
					disabled={busy || processing}
					aria-current={step === index + 1 ? 'step' : undefined}
					onclick={() => navigateStep(index + 1)}
					><span class="step-number">{index + 1}</span>{label}</button
				>{/each}
		</nav>
		<div class="stack">
			<Notice message={storageWarning} type="info" /><Notice
				message={saveError}
				onretry={() => persist()}
			/>
			<fieldset class="panel panel-pad" disabled={busy || processing}>
				<div class="form-section-title">
					<h2 id="step-title" tabindex="-1">{steps[step - 1]}</h2>
					<p>
						{step === 1
							? 'Identifique o veículo e o cliente.'
							: step === 2
								? 'Registre as condições de entrega ou retirada.'
								: step === 3
									? 'Selecione uma peça para registrar danos e fotos.'
									: 'Confira os dados e peça a assinatura do cliente.'}
					</p>
				</div>
				{#if step === 1}
					<div class="form-grid">
						<div class="field span-two">
							<span class="field-label" id="type-label">Tipo de vistoria</span>
							<div class="segmented" aria-labelledby="type-label">
								{#each ['Entrega', 'Retirada'] as type}<button
										type="button"
										aria-pressed={report.inspectionType === type}
										onclick={() => (report.inspectionType = type)}
										>{type}</button
									>{/each}
							</div>
						</div>
						<div class="field">
							<label for="plate">Placa do veículo *</label><input
								id="plate"
								bind:value={report.licensePlate}
								oninput={(e) =>
									(report.licensePlate = e.target.value
										.replace(/[^a-zA-Z0-9]/g, '')
										.toUpperCase()
										.slice(0, 7))}
								maxlength="7"
								autocomplete="off"
								autocapitalize="characters"
								spellcheck="false"
								placeholder="ABC1D23"
								aria-invalid={!!errors.licensePlate}
								aria-describedby="plate-error"
							/><span id="plate-error" class="field-error"
								>{errors.licensePlate || ''}</span
							>
						</div>
						<div class="field">
							<label for="client">Nome do cliente *</label><input
								id="client"
								bind:value={report.clientName}
								maxlength="200"
								autocomplete="name"
								placeholder="Nome completo"
								aria-invalid={!!errors.clientName}
								aria-describedby="client-error"
							/><span id="client-error" class="field-error"
								>{errors.clientName || ''}</span
							>
						</div>
						<div class="field">
							<label for="inspector">Inspetor *</label><input
								id="inspector"
								bind:value={report.inspectorName}
								maxlength="120"
								aria-invalid={!!errors.inspectorName}
								aria-describedby="inspector-error"
							/><span id="inspector-error" class="field-error"
								>{errors.inspectorName || ''}</span
							>
						</div>
						<div class="field">
							<label for="date">Data e hora *</label><input
								id="date"
								type="datetime-local"
								bind:value={report.inspectionDateTime}
								aria-invalid={!!errors.inspectionDateTime}
								aria-describedby="date-error"
							/><span id="date-error" class="field-error"
								>{errors.inspectionDateTime || ''}</span
							>
						</div>
					</div>
				{:else if step === 2}
					<div class="stack">
						<div class="field">
							<label for="mileage">Quilometragem (km) *</label><input
								id="mileage"
								inputmode="numeric"
								bind:value={report.mileage}
								oninput={(e) =>
									(report.mileage = formatMileage(e.target.value).slice(0, 20))}
								placeholder="45.000"
								aria-invalid={!!errors.mileage}
								aria-describedby="mileage-error"
							/><span id="mileage-error" class="field-error"
								>{errors.mileage || ''}</span
							>
						</div>
						<div class="field">
							<span class="field-label" id="fuel-label">Combustível</span>
							<div class="choice-grid" aria-labelledby="fuel-label">
								{#each ['0/8', '1/8', '2/8', '3/8', '4/8', '5/8', '6/8', '7/8', '8/8'] as level}<button
										type="button"
										aria-pressed={report.fuelLevel === level}
										onclick={() => (report.fuelLevel = level)}
										>{level === '0/8'
											? 'Vazio'
											: level === '4/8'
												? 'Meio · 4/8'
												: level === '8/8'
													? 'Cheio'
													: level}</button
									>{/each}
							</div>
						</div>
						<div>
							<h3>Itens presentes</h3>
							<label class="check-row" for="document"
								>Documento do veículo<input
									id="document"
									type="checkbox"
									bind:checked={report.hasDocument}
								/></label
							><label class="check-row" for="seat"
								>Cadeirinha infantil<input
									id="seat"
									type="checkbox"
									bind:checked={report.hasChildSeat}
								/></label
							><label class="check-row" for="toll"
								>Tag de pedágio<input
									id="toll"
									type="checkbox"
									bind:checked={report.hasEToll}
								/></label
							>
						</div>
					</div>
				{:else if step === 3}
					<div class="stack">
						<div class="section-heading">
							<div class="segmented">
								<button
									aria-pressed={damageView === 'map'}
									onclick={() => (damageView = 'map')}>Mapa</button
								><button
									aria-pressed={damageView === 'list'}
									onclick={() => (damageView = 'list')}>Lista de peças</button
								>
							</div>
							<span class="muted">{photoCount}/24 fotos</span>
						</div>
						<Notice message={errors.partStates || ''} />
						<div hidden={damageView !== 'map'}>
							<CarDiagram
								bind:this={diagram}
								bind:activePart
								partStates={report.partStates}
							/>
						</div>
						{#if damageView === 'list'}<div>
								{#each Object.entries(PART_NAMES) as [partId, name]}<button
										class="check-row"
										style="width:100%;text-align:left"
										onclick={() => (activePart = partId)}
										><span>{name}</span><span class="badge"
											>{STATUS_LABELS[report.partStates[partId]?.status] ||
												'Sem danos'}</span
										><Icon name="chevron" size={16} /></button
									>{/each}
							</div>{/if}
						<p class="field-help">
							{countDamages(report.partStates)} danos registrados. Se não houver danos,
							continue para a conclusão.
						</p>
					</div>
				{:else}
					<div class="stack">
						<div class="panel panel-pad" style="background:#f7f9f7">
							<div class="section-heading">
								<h3>Resumo da vistoria</h3>
								<button class="text-action" onclick={() => navigateStep(1)}
									>Editar dados<Icon name="edit" size={15} /></button
								>
							</div>
							<dl class="review-grid">
								<div>
									<dt>Placa</dt>
									<dd class="plate">{report.licensePlate}</dd>
								</div>
								<div>
									<dt>Tipo</dt>
									<dd>{report.inspectionType}</dd>
								</div>
								<div>
									<dt>Cliente</dt>
									<dd>{report.clientName}</dd>
								</div>
								<div>
									<dt>Inspetor</dt>
									<dd>{report.inspectorName}</dd>
								</div>
								<div>
									<dt>Quilometragem</dt>
									<dd>{report.mileage} km</dd>
								</div>
								<div>
									<dt>Combustível</dt>
									<dd>{report.fuelLevel}</dd>
								</div>
							</dl>
							<div class="inline" style="margin-top:16px">
								<button class="text-action" onclick={() => navigateStep(2)}
									>Editar interior</button
								><button class="text-action" onclick={() => navigateStep(3)}
									>Revisar {countDamages(report.partStates)} danos</button
								>
							</div>
						</div>
						<div class="field">
							<span class="field-label" id="license-label">Foto da CNH *</span
							><Notice message={photoError} />
							{#if report.clientLicensePhoto}<img
									class="upload-preview"
									src={mediaPreviewUrl(report.clientLicensePhoto)}
									alt="CNH do cliente"
								/>{/if}
							<div class="upload-controls">
								<button
									class="btn"
									aria-labelledby="license-label camera-label"
									data-invalid={!!errors.clientLicensePhoto}
									aria-describedby="license-error"
									onclick={() => cameraInput.click()}
									><Icon name="camera" /><span id="camera-label"
										>{processing
											? 'Preparando…'
											: report.clientLicensePhoto
												? 'Refazer foto'
												: 'Tirar foto'}</span
									></button
								><button class="btn" onclick={() => galleryInput.click()}
									><Icon name="image" />Galeria</button
								>
							</div>
							<input
								class="sr-only"
								tabindex="-1"
								type="file"
								accept="image/*"
								capture="environment"
								bind:this={cameraInput}
								onchange={uploadLicense}
								aria-label="Capturar CNH"
							/><input
								class="sr-only"
								tabindex="-1"
								type="file"
								accept="image/*"
								bind:this={galleryInput}
								onchange={uploadLicense}
								aria-label="Escolher CNH da galeria"
							/><span id="license-error" class="field-error"
								>{errors.clientLicensePhoto || ''}</span
							>
						</div>
						<div class="field">
							<span class="field-label">Assinatura do cliente *</span
							><SignaturePad
								bind:signature={report.clientSignature}
								invalid={!!errors.clientSignature}
							/><span class="field-error">{errors.clientSignature || ''}</span>
						</div>
					</div>
				{/if}
			</fieldset>
		</div>
		<div class="inspection-actions">
			<div>
				<button
					class="btn"
					disabled={busy || processing}
					onclick={() => (step === 1 ? leave() : navigateStep(step - 1))}
					><Icon name="back" size={17} />{step === 1
						? 'Sair'
						: 'Voltar'}</button
				><span
					class="save-state"
					class:error={saveState === 'error'}
					role="status"
					>{saveState === 'saving'
						? 'Salvando…'
						: saveState === 'saved'
							? 'Salvo neste dispositivo'
							: saveState === 'error'
								? 'Falha ao salvar — tente novamente'
								: eligible
									? 'Alterações pendentes'
									: 'Preencha placa e cliente para salvar'}</span
				><button
					class="btn primary"
					disabled={busy || processing}
					onclick={() => (step === 4 ? complete() : navigateStep(step + 1))}
					>{busy
						? 'Salvando…'
						: step === 4
							? 'Concluir vistoria'
							: 'Continuar'}<Icon
						name={step === 4 ? 'check' : 'arrow'}
						size={17}
					/></button
				>
			</div>
		</div>
	{/if}
</main>
{#if activePart}<DamageModal
		bind:partId={activePart}
		bind:partStates={report.partStates}
		partName={PART_NAMES[activePart]}
	/>{/if}
{#if discardOpen}<Dialog
		title="Sair sem salvar?"
		onclose={() => (discardOpen = false)}
		><p>
			Preencha a placa e o nome do cliente para salvar o rascunho. Se sair
			agora, estes dados serão perdidos.
		</p>
		{#snippet footer()}<button class="btn" onclick={() => (discardOpen = false)}
				>Continuar editando</button
			><button
				class="btn danger"
				onclick={async () => {
					allowLeave = true;
					discardOpen = false;
					await goto(leaveTarget || '/dashboard');
				}}>Descartar e sair</button
			>{/snippet}</Dialog
	>{/if}
