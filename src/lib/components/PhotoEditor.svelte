<script>
  import Dialog from './Dialog.svelte';
  import { mediaPreviewUrl } from '$lib/mediaPreview.js';
  import { encodePhotoCanvas } from '$lib/utils/imageCompressor.js';

  let { photo, title, onsave, onclose } = $props();
  let image;
  let canvas = $state();
  let width = $state(0);
  let height = $state(0);
  let strokes = $state.raw([]);
  let active = null;
  let saving = $state(false);
  let error = $state('');

  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * width / rect.width,
      y: (event.clientY - rect.top) * height / rect.height
    };
  }

  function paint(stroke) {
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = '#ff3030';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = stroke.thickness;
    ctx.stroke(stroke.path);
  }

  function redraw() {
    canvas.getContext('2d').clearRect(0, 0, width, height);
    for (const stroke of strokes) paint(stroke);
    if (active) paint(active);
  }

  function start(event) {
    if (saving || active || !event.isPrimary || event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    const { x, y } = point(event);
    const path = new Path2D();
    path.moveTo(x, y);
    path.lineTo(x + 0.01, y);
    active = { id: event.pointerId, path, thickness: 4 * width / canvas.getBoundingClientRect().width };
    paint(active);
  }

  function move(event) {
    if (active?.id !== event.pointerId) return;
    const { x, y } = point(event);
    active.path.lineTo(x, y);
    redraw();
  }

  function finish(event) {
    if (active?.id !== event.pointerId) return;
    move(event);
    strokes = [...strokes, active];
    active = null;
  }

  function cancelStroke(event) {
    if (active?.id !== event.pointerId) return;
    active = null;
    redraw();
  }

  function undo() {
    if (active) return;
    strokes = strokes.slice(0, -1);
    redraw();
  }

  async function save() {
    if (saving || active || !strokes.length) return;
    saving = true;
    error = '';
    try {
      const output = document.createElement('canvas');
      output.width = width;
      output.height = height;
      const ctx = output.getContext('2d');
      ctx.drawImage(image, 0, 0);
      ctx.drawImage(canvas, 0, 0);
      onsave(await encodePhotoCanvas(output));
    } catch {
      error = 'Não foi possível salvar a marcação. Tente novamente.';
    } finally {
      saving = false;
    }
  }
</script>

<Dialog {title} fullscreen {onclose} busy={saving}>
  <div class="stage">
    <img bind:this={image} src={mediaPreviewUrl(photo)} alt={title}
      onload={(event) => {
        width = event.currentTarget.naturalWidth;
        height = event.currentTarget.naturalHeight;
      }}
      onerror={() => error = 'Não foi possível abrir a foto.'} />
    {#if onsave && width && height}
      <canvas bind:this={canvas} {width} {height} style:--ratio={width / height}
        aria-label="Área para desenhar na foto"
        onpointerdown={start} onpointermove={move} onpointerup={finish}
        onpointercancel={cancelStroke} onlostpointercapture={cancelStroke}></canvas>
    {/if}
    {#if error}<p role="alert">{error}</p>{/if}
  </div>
  {#snippet footer()}
    {#if onsave}
      <span class="hint">Desenhe para circular um detalhe.</span>
      <button type="button" class="btn" disabled={!strokes.length || saving} onclick={undo}>Desfazer</button>
      <button type="button" class="btn primary" disabled={!strokes.length || saving} onclick={save}>
        {saving ? 'Salvando…' : 'Salvar marcação'}
      </button>
    {:else}
      <button type="button" class="btn" onclick={onclose}>Fechar foto</button>
    {/if}
  {/snippet}
</Dialog>

<style>
  .stage {
    height: 100%;
    position: relative;
    container-type: size;
    display: grid;
    grid-template: 100% / 100%;
    place-items: center;
    background: #161a18;
  }
  img, canvas { grid-area: 1 / 1; }
  img { width: 100%; height: 100%; min-height: 0; object-fit: contain; }
  canvas {
    width: min(100cqw, calc(100cqh * var(--ratio)));
    height: auto;
    touch-action: none;
    cursor: crosshair;
  }
  p { position: absolute; background: white; padding: 0.6rem 1rem; border-radius: 8px; }
  .hint { margin-right: auto; font-size: 0.875rem; }
  @media (max-width: 560px) {
    :global(.app-dialog.fullscreen .dialog-footer) { flex-wrap: wrap; }
    .hint { flex-basis: 100%; }
  }
</style>
