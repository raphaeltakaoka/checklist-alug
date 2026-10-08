<script>
	import LookupField from './LookupField.svelte';
	import { normalizePlate } from '$lib/cars.js';

	let { plate = $bindable(''), carId = null, error = '', mode = 'inspection', onSelect, onClear, onInput } = $props();
	const config = $derived({
		id: mode === 'history' ? 'history-plate' : 'plate',
		label: mode === 'history' ? 'Buscar por placa' : 'Placa do veículo *', maxLength: 8, autocapitalize: 'characters',
		endpoint: '/api/cars/search', resultKey: 'cars', normalize: normalizePlate,
		normalizeInput: value => normalizePlate(value).slice(0, 7),
		placeholder: 'ABC1D23',
		linkedLabel: mode === 'history' ? 'Placa selecionada' : 'Veículo vinculado',
		clearLabel: mode === 'history' ? 'Limpar placa' : 'Desvincular veículo',
		linkedHelp: mode === 'history' ? 'Limpe a placa para consultar outro veículo.' : 'Desvincule para escolher outro veículo.',
		help: 'Digite pelo menos 3 caracteres e selecione um veículo.',
		loadingMessage: 'Buscando veículos…', resultsLabel: 'Veículos encontrados',
		emptyMessage: mode === 'history' ? 'Nenhum veículo encontrado para esta placa.' : 'Nenhum veículo encontrado. Cadastre o veículo no CRM e tente novamente.',
		offlineMessage: 'Conecte-se à internet para buscar um veículo cadastrado.',
		failureMessage: 'Não foi possível buscar veículos. Verifique a conexão e tente novamente.',
		primary: car => car.plate, secondary: car => [car.make, car.model].filter(Boolean).join(' ') || 'Sem marca/modelo'
	});
</script>

<LookupField bind:value={plate} selectedId={carId} {error} {config} {onSelect} {onClear} {onInput} />
