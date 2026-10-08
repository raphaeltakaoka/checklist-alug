<script>
	import LookupField from './LookupField.svelte';
	import { normalizePlate } from '$lib/cars.js';

	let { plate = $bindable(''), carId = null, error = '', onSelect, onClear, onInput } = $props();
	const config = {
		id: 'plate', label: 'Placa do veículo *', maxLength: 8, autocapitalize: 'characters',
		endpoint: '/api/cars/search', resultKey: 'cars', normalize: normalizePlate,
		normalizeInput: value => normalizePlate(value).slice(0, 7),
		placeholder: 'ABC1D23', linkedLabel: 'Veículo vinculado', clearLabel: 'Desvincular veículo',
		linkedHelp: 'Desvincule para escolher outro veículo.', help: 'Digite pelo menos 3 caracteres e selecione um veículo.',
		loadingMessage: 'Buscando veículos…', resultsLabel: 'Veículos encontrados',
		emptyMessage: 'Nenhum veículo encontrado. Cadastre o veículo no CRM e tente novamente.',
		offlineMessage: 'Conecte-se à internet para buscar um veículo cadastrado.',
		failureMessage: 'Não foi possível buscar veículos. Verifique a conexão e tente novamente.',
		primary: car => car.plate, secondary: car => [car.make, car.model].filter(Boolean).join(' ') || 'Sem marca/modelo'
	};
</script>

<LookupField bind:value={plate} selectedId={carId} {error} {config} {onSelect} {onClear} {onInput} />
