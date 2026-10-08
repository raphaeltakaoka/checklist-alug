<script>
	import LookupField from './LookupField.svelte';
	import { normalizeContactName } from '$lib/contacts.js';

	let { name = $bindable(''), contactId = null, error = '', onSelect, onClear } = $props();
	const config = {
		id: 'client', label: 'Nome do cliente *', maxLength: 200,
		endpoint: '/api/contacts/search', resultKey: 'contacts', normalize: normalizeContactName,
		placeholder: 'Buscar contato cadastrado', linkedLabel: 'Contato vinculado', clearLabel: 'Desvincular contato',
		linkedHelp: 'Desvincule para escolher outro contato.', help: 'Digite pelo menos 3 caracteres e selecione um contato.',
		loadingMessage: 'Buscando contatos…', resultsLabel: 'Contatos encontrados',
		emptyMessage: 'Nenhum contato encontrado. Cadastre o contato no CRM e tente novamente.',
		offlineMessage: 'Conecte-se à internet para buscar um contato cadastrado.',
		failureMessage: 'Não foi possível buscar contatos. Verifique a conexão e tente novamente.',
		primary: contact => contact.nome, secondary: contact => contact.email || contact.telefone || 'Sem contato adicional'
	};
</script>

<LookupField bind:value={name} selectedId={contactId} {error} {config} {onSelect} {onClear} />
