<script>
  import { PART_NAMES, STATUS_LABELS, partEntries } from '$lib/inspection.js';
  import Dialog from './Dialog.svelte';
  import DamageModal from './DamageModal.svelte';

  let { category = $bindable(), partStates = $bindable() } = $props();
  let editing = $state(null);
  let deleting = $state(null);
  let items = $derived(partEntries(partStates, category));

  function removeItem() {
    const next = { ...partStates };
    delete next[deleting];
    partStates = next;
    deleting = null;
  }
</script>

<Dialog title={PART_NAMES[category]} onclose={() => (category = null)}>
  <div class="stack">
    <p class="muted">Registre cada item com seu nome, condição, observações e fotos.</p>
    <button class="btn primary" onclick={() => (editing = `${category}_${crypto.randomUUID()}`)}>Adicionar item</button>
    {#if !items.length}<p class="muted">Nenhum item cadastrado.</p>{/if}
    {#each items as [key, item] (key)}
      <div class="panel panel-pad stack">
        <div class="section-heading">
          <strong>{item.name}</strong>
          <span class="badge">{STATUS_LABELS[item.status]}</span>
        </div>
        {#if item.deliveryStatus && item.deliveryStatus !== 'none'}
          <span class={['badge', { danger: item.isNewDamage }]}>{item.isNewDamage ? 'Novo dano ou agravamento' : 'Pré-existente'}</span>
        {/if}
        {#if item.comments}<p class="muted">{item.comments}</p>{/if}
        <span class="muted">{item.photos?.length || 0}/6 fotos</span>
        <div class="inline">
          <button class="btn" aria-label={`Editar ${item.name}`} onclick={() => (editing = key)}>Editar</button>
          <button class="btn danger" aria-label={`Excluir ${item.name}`} onclick={() => (deleting = key)}>Excluir</button>
        </div>
      </div>
    {/each}
  </div>
  {#snippet footer()}<button class="btn" onclick={() => (category = null)}>Fechar</button>{/snippet}
</Dialog>

{#if editing}
  {#key editing}
    <DamageModal bind:partId={editing} bind:partStates partName={partStates[editing]?.name || 'Adicionar item'} />
  {/key}
{/if}
{#if deleting}
  <Dialog title="Excluir item?" onclose={() => (deleting = null)}>
    <p>Excluir “{partStates[deleting].name}” e suas fotos desta vistoria?</p>
    {#snippet footer()}
      <button class="btn" onclick={() => (deleting = null)}>Cancelar</button>
      <button class="btn danger" onclick={removeItem}>Excluir item</button>
    {/snippet}
  </Dialog>
{/if}
