<script>
  import { mediaPreviewUrl } from "$lib/mediaPreview.js";
  import {
    PART_NAMES,
    STATUS_LABELS,
    calculateFuelDiff,
    calculateMileageDiff,
    countDamages,
    detectNewDamages,
    formatInspectionDateTime,
  } from "$lib/inspection.js";
  import logo from "$lib/assets/logo_alug_locadora.png";
  import Icon from "./Icon.svelte";
  import Notice from "./Notice.svelte";
  import Dialog from "./Dialog.svelte";
  let {
    inspection,
    backHref = "/dashboard/checklists",
    ondelete = null,
    ondeletephoto = null,
  } = $props();
  let preview = $state(null);
  let confirm = $state(null);
  let busy = $state(false);
  let error = $state("");
  let parts = $derived(
    Object.entries(inspection.partStates || {}).filter(
      ([, part]) => part.status !== "none" || part.photos?.length || part.comments,
    ),
  );
  let mileageDiff = $derived(
    inspection.deliverySnapshot?.mileage
      ? calculateMileageDiff(inspection.deliverySnapshot.mileage, inspection.mileage)
      : null,
  );
  let fuelDiff = $derived(
    inspection.deliverySnapshot?.fuelLevel
      ? calculateFuelDiff(inspection.deliverySnapshot.fuelLevel, inspection.fuelLevel)
      : null,
  );
  let newDamages = $derived(
    inspection.inspectionType === "Devolução"
      ? detectNewDamages(inspection.partStates, inspection.deliverySnapshot?.partStates)
      : [],
  );
  async function remove() {
    if (busy) return;
    busy = true;
    error = "";
    try {
      if (confirm === "report") await ondelete();
      else {
        await ondeletephoto(preview.part, preview.index);
        preview = null;
      }
      confirm = null;
    } catch {
      error = "Não foi possível excluir. Verifique sua conexão e tente novamente.";
    } finally {
      busy = false;
    }
  }
</script>

<div class="section-heading print-hidden">
  <a class="text-action" href={backHref}><Icon name="back" size={17} />Voltar</a>
  <div class="inline">
    {#if inspection.inspectionType === "Entrega"}
      <a
        class="btn primary"
        href={`/dashboard/new?type=Devolucao&deliveryId=${encodeURIComponent(inspection.id)}`}
      >
        <Icon name="plus" size={17} />Fazer devolução
      </a>
    {/if}
    <button class="btn" onclick={() => window.print()}
      ><Icon name="print" size={18} />Imprimir</button
    >{#if ondelete}<button
        class="icon-button"
        aria-label="Excluir vistoria"
        onclick={() => {
          confirm = "report";
          error = "";
        }}><Icon name="trash" /></button
      >{/if}
  </div>
</div>
<article class="panel report">
  <div class="report-brand">
    <img src={logo} alt="Alug Locadora" />
    <div style="text-align:right">
      <span class="eyebrow">Laudo de vistoria</span>
      <p class="muted">
        {formatInspectionDateTime(inspection.inspectionDateTime)}
      </p>
    </div>
  </div>
  <div class="page-heading">
    <div>
      <h1 class="plate" style="font-size:1.8rem">{inspection.licensePlate}</h1>
      <p>{inspection.clientName}</p>
    </div>
    <span class="badge">{inspection.inspectionType}</span>
  </div>
  <dl class="review-grid">
    <div>
      <dt>Inspetor</dt>
      <dd>{inspection.inspectorName}</dd>
    </div>
    <div>
      <dt>Quilometragem</dt>
      <dd>
        {inspection.mileage || "Não informada"}{inspection.mileage ? " km" : ""}
      </dd>
    </div>
    <div>
      <dt>Combustível</dt>
      <dd>{inspection.fuelLevel}</dd>
    </div>
    <div>
      <dt>Itens presentes</dt>
      <dd>
        {[
          inspection.hasDocument && "Documento",
          inspection.hasChildSeat && "Cadeirinha",
          inspection.hasEToll && "Tag de pedágio",
        ]
          .filter(Boolean)
          .join(", ") || "Nenhum"}
      </dd>
    </div>
  </dl>
  {#if inspection.inspectionType === "Devolução" && inspection.deliverySnapshot}
    <section class="report-section">
      <div class="section-heading">
        <h2>Comparativo com a Entrega</h2>
        {#if inspection.deliveryChecklistId}
          <a
            class="text-action print-hidden"
            href={`/dashboard/checklists/${encodeURIComponent(inspection.deliveryChecklistId)}`}
          >
            Ver laudo da entrega<Icon name="arrow" size={16} />
          </a>
        {/if}
      </div>
      <p class="muted">
        Vistoria de entrega realizada em {formatInspectionDateTime(
          inspection.deliverySnapshot.inspectionDateTime,
        )} por {inspection.deliverySnapshot.inspectorName || "Inspetor"}.
      </p>
      <dl class="review-grid" style="margin-top:16px">
        <div>
          <dt>Quilometragem no período</dt>
          <dd>
            {inspection.deliverySnapshot.mileage
              ? inspection.deliverySnapshot.mileage + " km"
              : "Não informada"} → {inspection.mileage
              ? inspection.mileage + " km"
              : "Não informada"}
            {#if mileageDiff}
              <span class="badge" style="margin-left:6px;display:inline-block">
                {mileageDiff.isNegative
                  ? "Hodômetro menor que entrega"
                  : `${mileageDiff.formatted} km rodados`}
              </span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>Combustível</dt>
          <dd>
            {inspection.deliverySnapshot.fuelLevel || "N/A"} → {inspection.fuelLevel || "N/A"}
            {#if fuelDiff}
              <span class="badge" style="margin-left:6px;display:inline-block">
                {fuelDiff.text}
              </span>
            {/if}
          </dd>
        </div>
        <div>
          <dt>Itens na entrega vs devolução</dt>
          <dd>
            {[
              inspection.deliverySnapshot.hasDocument !== inspection.hasDocument &&
                (inspection.hasDocument ? "Documento devolvido" : "Documento ausente"),
              inspection.deliverySnapshot.hasChildSeat !== inspection.hasChildSeat &&
                (inspection.hasChildSeat ? "Cadeirinha devolvida" : "Cadeirinha ausente"),
              inspection.deliverySnapshot.hasEToll !== inspection.hasEToll &&
                (inspection.hasEToll ? "Tag presente" : "Tag ausente"),
            ]
              .filter(Boolean)
              .join(", ") || "Mesmos itens da entrega"}
          </dd>
        </div>
        <div>
          <dt>Novas avarias detectadas</dt>
          <dd>
            {#if newDamages.length > 0}
              <span class="badge danger" style="font-weight:600">
                {newDamages.length}
                {newDamages.length === 1 ? "nova avaria" : "novas avarias"}
              </span>
            {:else}
              <span
                class="badge"
                style="color:#15803d;border-color:#86efac;background:#f0fdf4;font-weight:600"
              >
                Nenhuma nova avaria
              </span>
            {/if}
          </dd>
        </div>
      </dl>

      {#if newDamages.length > 0}
        <div style="margin-top:20px">
          <h3 style="color:#b91c1c;margin-bottom:12px">Detalhamento das novas avarias</h3>
          <div class="stack">
            {#each newDamages as damage (damage.partId)}
              <div class="panel panel-pad" style="background:#fef2f2;border-color:#fecaca">
                <div class="section-heading">
                  <h4>{damage.partName}</h4>
                  <span class="badge danger"
                    >{STATUS_LABELS[damage.status] || damage.status}
                    {damage.isWorsened ? "(Agravado)" : "(Nova)"}</span
                  >
                </div>
                {#if damage.isWorsened}
                  <p class="muted" style="font-size:0.875rem;margin-bottom:6px">
                    Condição na entrega: <strong
                      >{STATUS_LABELS[damage.previousStatus] || damage.previousStatus}</strong
                    >
                    {#if damage.previousComments}
                      — "{damage.previousComments}"{/if}
                  </p>
                {/if}
                {#if damage.comments}
                  <p style="margin-top:4px">{damage.comments}</p>
                {/if}
                {#if damage.photos?.length}
                  <div class="photo-grid" style="margin-top:10px">
                    {#each damage.photos as photo, pIdx (photo)}
                      <div class="photo-tile">
                        <button
                          aria-label={`Ampliar foto ${pIdx + 1} de ${damage.partName}`}
                          onclick={() => (preview = { value: photo })}
                        >
                          <img
                            src={mediaPreviewUrl(photo)}
                            alt={`${damage.partName} - foto ${pIdx + 1}`}
                          />
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}
  <section class="report-section">
    <h2>
      Danos registrados <span class="count">{countDamages(inspection.partStates)}</span>
    </h2>
    {#if inspection.carDiagramImage}<img
        src={mediaPreviewUrl(inspection.carDiagramImage)}
        alt="Mapa dos danos registrados no veículo"
        style="height:300px;max-width:100%;margin:0 auto 20px"
      />{/if}
    {#if !parts.length}<p class="muted">Nenhum dano registrado nesta vistoria.</p>{/if}
    {#each parts as [partId, part] (partId)}<div class="report-part">
        <div class="section-heading">
          <h3>{PART_NAMES[partId] || partId}</h3>
          <div class="inline" style="gap:6px">
            {#if part.isNewDamage}
              <span class="badge danger">Nova avaria</span>
            {:else if part.deliveryStatus}
              <span class="badge">Pré-existente</span>
            {/if}
            <span class="badge warning">{STATUS_LABELS[part.status] || part.status}</span>
          </div>
        </div>
        {#if part.comments}<p>{part.comments}</p>{/if}
        {#if part.photos?.length}<div class="photo-grid">
            {#each part.photos as photo, index (photo)}<div class="photo-tile">
                <button
                  aria-label={`Ampliar foto ${index + 1} de ${PART_NAMES[partId]}`}
                  onclick={() => (preview = { value: photo, part: partId, index })}
                  ><img
                    src={mediaPreviewUrl(photo)}
                    alt={`${PART_NAMES[partId]} — foto ${index + 1}`}
                    loading="eager"
                  /></button
                >
              </div>{/each}
          </div>{/if}
      </div>{/each}
  </section>
  <section class="report-section">
    <h2>Identificação e assinatura</h2>
    <p class="muted" style="margin-bottom:20px">
      Pelo presente instrumento, autorizo e concordo que os danos mapeados acima refletem o estado
      físico exato do veículo no momento da inspeção.
    </p>
    <div class="review-grid">
      <div>
        <h3>CNH do cliente</h3>
        {#if inspection.clientLicensePhoto}<button
            class="text-action"
            aria-label="Ampliar CNH do cliente"
            onclick={() => (preview = { value: inspection.clientLicensePhoto })}
            ><img
              src={mediaPreviewUrl(inspection.clientLicensePhoto)}
              alt="CNH do cliente"
              class="upload-preview"
            /></button
          >{:else}<p class="muted">Não disponível.</p>{/if}
      </div>
      <div>
        <h3>{inspection.clientSignatureName}</h3>
        {#if inspection.clientSignature}<img
            src={mediaPreviewUrl(inspection.clientSignature)}
            alt={`Assinatura de ${inspection.clientSignatureName}`}
            class="report-signature"
          />{:else}<p class="muted">Assinatura não disponível.</p>{/if}
        <p class="muted">Assinatura do cliente</p>
      </div>
    </div>
  </section>
</article>
{#if preview}<Dialog
    title={preview.part ? PART_NAMES[preview.part] : "Documento do cliente"}
    wide
    onclose={() => (preview = null)}
    ><img
      class="preview-image"
      src={mediaPreviewUrl(preview.value)}
      alt={preview.part ? `Foto de ${PART_NAMES[preview.part]}` : "CNH do cliente"}
    />{#snippet footer()}{#if preview.part && ondeletephoto}<button
          class="btn"
          onclick={() => {
            confirm = "photo";
            error = "";
          }}><Icon name="trash" size={17} />Excluir foto</button
        >{/if}<button class="btn primary" onclick={() => (preview = null)}>Fechar</button
      >{/snippet}</Dialog
  >{/if}
{#if confirm}<Dialog
    title={confirm === "report" ? "Excluir vistoria?" : "Excluir foto?"}
    onclose={() => (confirm = null)}
    {busy}
    ><div class="stack">
      <p>
        {confirm === "report"
          ? `A vistoria de ${inspection.licensePlate} será excluída.`
          : "Esta foto será removida da vistoria."} Esta ação não pode ser desfeita.
      </p>
      <Notice message={error} />
    </div>
    {#snippet footer()}<button class="btn" disabled={busy} onclick={() => (confirm = null)}
        >Cancelar</button
      ><button class="btn danger" disabled={busy} onclick={remove}
        >{busy ? "Excluindo…" : "Excluir"}</button
      >{/snippet}</Dialog
  >{/if}
