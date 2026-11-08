<script>
	import { authenticatedFetch } from '$lib/api.js';
	import { googleMapsUrl, isValidLocation } from '$lib/inspectionLocation.js';
	import { formatInspectionDateTime } from '$lib/inspection.js';
	import Notice from './Notice.svelte';

	let { location = null, status = 'success', error = '', onretry = null, compact = false, inspectionId = null } = $props();
	let mapUrl = $state('');
	let retry = $state(0);
	let loadingMap = $state(false);
	let captured = $derived(status === 'success' && isValidLocation(location));

	$effect(() => {
		if (compact || !captured || !inspectionId) return;
		const endpoint = `/api/checklists/${encodeURIComponent(inspectionId)}/location-map`;
		const method = retry === 0 && location.mapImagePath ? 'GET' : 'POST';
		const controller = new AbortController();
		let objectUrl = '';
		mapUrl = '';
		loadingMap = true;
		authenticatedFetch(endpoint, { method, signal: controller.signal })
			.then(response => response.blob())
			.then(blob => {
				if (controller.signal.aborted) return;
				objectUrl = URL.createObjectURL(blob);
				mapUrl = objectUrl;
			})
			.catch(() => {})
			.finally(() => { if (!controller.signal.aborted) loadingMap = false; });
		return () => {
			controller.abort();
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	});
</script>

<section class="inspection-location" aria-label="Localização do dispositivo">
	{#if compact}
		<div class="location-summary">
			<div>
				<p class="location-status" role="status">{captured ? 'Localização capturada.' : status === 'loading' ? 'Obtendo localização atual…' : 'Localização não capturada.'}</p>
				{#if captured}<time class="muted" datetime={location.capturedAt}>Capturada em {formatInspectionDateTime(location.capturedAt)}</time>{/if}
			</div>
			{#if status === 'error' && onretry}<button class="text-action" onclick={onretry}>Tentar novamente</button>{/if}
		</div>
	{:else}
		<h3>Localização do dispositivo</h3>
		{#if status === 'loading'}
			<p role="status">Obtendo localização atual… Autorize o acesso à localização quando solicitado.</p>
		{:else if error}
			<Notice message={error} {onretry} />
		{/if}
		{#if status === 'success' && isValidLocation(location)}
			<p class="field-help" role="status">Localização capturada automaticamente.</p>
			<dl class="review-grid">
				<div><dt>Latitude</dt><dd>{location.latitude.toFixed(6)}</dd></div>
				<div><dt>Longitude</dt><dd>{location.longitude.toFixed(6)}</dd></div>
				<div><dt>Precisão aproximada</dt><dd>{Math.ceil(location.accuracy)} m</dd></div>
				<div><dt>Capturada em</dt><dd>{formatInspectionDateTime(location.capturedAt)}</dd></div>
			</dl>
			{#if mapUrl}
				<img
					class="location-map"
					src={mapUrl}
					alt="Mapa da localização capturada, com marcador na posição do dispositivo"
					width="640"
					height="320"
					onerror={() => { mapUrl = ''; }}
				/>
				<p class="muted map-credit"><a href="https://www.geoapify.com/">Powered by Geoapify</a> · <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap contributors</a></p>
			{:else if loadingMap}
				<p class="muted print-hidden">Carregando mapa…</p>
			{:else}
				<p class="muted">Mapa indisponível. A localização permanece registrada nas coordenadas acima.</p>
				{#if inspectionId}<button class="text-action print-hidden" onclick={() => retry++}>Tentar carregar mapa</button>{/if}
			{/if}
			<a class="text-action print-hidden" href={googleMapsUrl(location)} target="_blank" rel="noopener noreferrer">Abrir no Google Maps</a>
		{/if}
	{/if}
</section>

<style>
	.inspection-location { min-width: 0; }
	.location-summary { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.location-status { margin: 0; font-weight: 600; }
	time { display: block; margin-top: 4px; font-size: 0.875rem; }
	h3 { margin-bottom: 12px; }
	.location-map { display: block; width: 100%; height: auto; margin: 16px 0 12px; }
	.map-credit { font-size: 0.75rem; }
	@media print {
		.inspection-location { break-inside: avoid; }
		.location-map { max-width: 640px; }
	}
</style>
