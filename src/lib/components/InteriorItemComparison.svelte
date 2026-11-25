<script>
  import { compareInteriorItems } from '$lib/inspectionAccessories.js';

  let { inspection } = $props();
  let comparison = $derived(inspection.deliverySnapshot && compareInteriorItems(inspection, inspection.deliverySnapshot));
</script>

{#if comparison}
  {#if comparison.changes.length}
    <ul>
      {#each comparison.changes as change (change)}
        <li>{change}</li>
      {/each}
    </ul>
  {:else}
    <p>Nenhuma alteração nos itens comparados.</p>
  {/if}
  {#if comparison.notCompared.length}
    <p class="field-help">Sem respostas suficientes para comparar {comparison.notCompared.join(', ')}.</p>
  {/if}
{:else}
  <p>Nenhuma vistoria de entrega vinculada para comparar os itens.</p>
{/if}

<style>
  ul {
    list-style: disc;
    padding-inline-start: 1.25em;
  }

  .field-help {
    margin-top: 6px;
  }
</style>
