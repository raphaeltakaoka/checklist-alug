<script>
  import { flushSync } from 'svelte';
  import { on } from 'svelte/events';
  import { PART_NAMES, countDamages } from '$lib/inspection.js';
  // Svelte 5 Runes for properties
  let { activePart = $bindable(), partStates = {} } = $props();
  let svgElement;
  let viewport;
  let zoom = $state(1);
  const maxZoom = 3;

  function placeZoom(scale, anchorX, anchorY, x, y) {
    flushSync(() => { zoom = Math.max(1, Math.min(maxZoom, scale)); });
    viewport.scrollLeft = anchorX * zoom - x;
    viewport.scrollTop = anchorY * zoom - y;
  }

  function zoomBy(amount) {
    const x = viewport.clientWidth / 2;
    const y = viewport.clientHeight / 2;
    placeZoom(zoom + amount, (viewport.scrollLeft + x) / zoom, (viewport.scrollTop + y) / zoom, x, y);
  }

  function pinchZoom(node) {
    let pinch;
    function handleTouches(event) {
      if (event.touches.length !== 2) {
        pinch = null;
        return;
      }
      event.preventDefault();
      const [a, b] = event.touches;
      const distance = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const rect = node.getBoundingClientRect();
      const x = (a.clientX + b.clientX) / 2 - rect.left;
      const y = (a.clientY + b.clientY) / 2 - rect.top;
      if (!distance) return;
      if (!pinch) {
        pinch = {
          distance, zoom,
          anchorX: (node.scrollLeft + x) / zoom,
          anchorY: (node.scrollTop + y) / zoom
        };
      } else {
        placeZoom(pinch.zoom * distance / pinch.distance, pinch.anchorX, pinch.anchorY, x, y);
      }
    }
    const cleanup = ['touchstart', 'touchmove', 'touchend', 'touchcancel'].map(type =>
      on(node, type, handleTouches, { passive: false })
    );
    return () => cleanup.forEach(remove => remove());
  }

  export function capture() {
    if (!svgElement || typeof window === "undefined") return null;
    const clone = svgElement.cloneNode(true);
    const originals = svgElement.querySelectorAll("path, rect, text, circle, line, polygon");
    const clones = clone.querySelectorAll("path, rect, text, circle, line, polygon");
    for (let index = 0; index < originals.length; index += 1) {
      const style = window.getComputedStyle(originals[index]);
      clones[index].setAttribute("fill", style.fill);
      clones[index].setAttribute("stroke", style.stroke);
      clones[index].setAttribute("stroke-width", style.strokeWidth || "1px");
      clones[index].setAttribute("opacity", style.opacity || "1");
      clones[index].removeAttribute("class");
      clones[index].removeAttribute("role");
      clones[index].removeAttribute("tabindex");
    }
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("style", "background:transparent;max-width:100%;height:auto");
    clone.removeAttribute("class");
    return new Blob([new XMLSerializer().serializeToString(clone)], {
      type: "image/svg+xml",
    });
  }

  function handleKeyDown(event, partId) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activePart = partId;
    }
  }

  function getSVGPartColor(partId) {
    const state = partStates[partId];
    if (!state || state.status === "none") {
      if (partId.endsWith("_wheel")) {
        return "fill-slate-700  stroke-slate-400  hover:fill-slate-600 ";
      }
      return "fill-slate-100/60  stroke-slate-300  hover:fill-slate-200/50 ";
    }

    // New damage in return inspection (high priority highlight)
    if (state.isNewDamage) {
      if (state.status === "broken") return "fill-red-200/60 stroke-red-600 stroke-[2.5px] ";
      if (state.status === "damaged") return "fill-red-100/60 stroke-red-600 stroke-[2px] ";
      if (state.status === "dent") return "fill-orange-200/60 stroke-red-500 stroke-[2px] ";
      return "fill-amber-200/60 stroke-red-500 stroke-[2px] ";
    }

    // Pre-existing damage from delivery inspection
    if (state.deliveryStatus || state.isNewDamage === false) {
      return "fill-amber-50/70 stroke-amber-500 stroke-[1.5px] stroke-dasharray-[4,2] ";
    }

    if (state.status === "scratch") return "fill-amber-100/60  stroke-amber-500 ";
    if (state.status === "dent") return "fill-orange-100/60  stroke-orange-500 ";
    if (state.status === "crack") return "fill-purple-100/60  stroke-purple-500 ";
    if (state.status === "broken") return "fill-transparent  stroke-red-500 ";
    if (state.status === "damaged") return "fill-indigo-100/60  stroke-indigo-500 ";
    return "fill-slate-100/60  stroke-slate-300 ";
  }
</script>

<div
  class="w-full flex flex-col lg:flex-row items-stretch lg:items-start justify-center gap-6 lg:gap-10 p-0 bg-transparent border-transparent shadow-none"
>
  <!-- Visual Blueprint (SVG) -->
  <div class="w-full min-w-0 max-w-96 mx-auto">
    <div class="flex items-center justify-center gap-3 mb-2">
      <button class="icon-button" type="button" aria-label="Reduzir diagrama" disabled={zoom <= 1} onclick={() => zoomBy(-0.5)}>−</button>
      <span class="tabular-nums">{Math.round(zoom * 100)}%</span>
      <button class="icon-button" type="button" aria-label="Ampliar diagrama" disabled={zoom >= maxZoom} onclick={() => zoomBy(0.5)}>+</button>
    </div>
    <div bind:this={viewport} {@attach pinchZoom} class="diagram-viewport aspect-2/5 overflow-auto">
    <!-- Dynamic Interactive Car SVG Outline -->
    <svg bind:this={svgElement} viewBox="20 0 160 400" style:width={zoom * 100 + '%'} class="block max-w-none h-auto select-none">
      <!-- Main Car Chassis Body Shadow -->
      <rect
        x="35"
        y="25"
        width="130"
        height="340"
        rx="35"
        fill="none"
        stroke="rgba(59, 130, 246, 0.1)"
        stroke-width="8"
      />

      <!-- Wheels -->
      <rect
        x="22"
        y="55"
        width="15"
        height="40"
        rx="4"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_front_wheel',
        )} {activePart === 'left_front_wheel' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_front_wheel"]}
        tabindex="0"
        onclick={() => (activePart = "left_front_wheel")}
        onkeydown={e => handleKeyDown(e, "left_front_wheel")}
      />
      <rect
        x="163"
        y="55"
        width="15"
        height="40"
        rx="4"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_front_wheel',
        )} {activePart === 'right_front_wheel' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_front_wheel"]}
        tabindex="0"
        onclick={() => (activePart = "right_front_wheel")}
        onkeydown={e => handleKeyDown(e, "right_front_wheel")}
      />
      <rect
        x="22"
        y="275"
        width="15"
        height="40"
        rx="4"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_rear_wheel',
        )} {activePart === 'left_rear_wheel' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_rear_wheel"]}
        tabindex="0"
        onclick={() => (activePart = "left_rear_wheel")}
        onkeydown={e => handleKeyDown(e, "left_rear_wheel")}
      />
      <rect
        x="163"
        y="275"
        width="15"
        height="40"
        rx="4"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_rear_wheel',
        )} {activePart === 'right_rear_wheel' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_rear_wheel"]}
        tabindex="0"
        onclick={() => (activePart = "right_rear_wheel")}
        onkeydown={e => handleKeyDown(e, "right_rear_wheel")}
      />

      <!-- Front Bumper -->
      <path
        d="M 45,28 C 65,15 135,15 155,28 C 160,33 160,38 150,38 C 120,35 80,35 50,38 C 40,38 40,33 45,28 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'front_bumper',
        )} {activePart === 'front_bumper' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["front_bumper"]}
        tabindex="0"
        onclick={() => (activePart = "front_bumper")}
        onkeydown={e => handleKeyDown(e, "front_bumper")}
      />

      <!-- Hood -->
      <path
        d="M 60,42 L 140,42 C 146,80 146,100 148,110 L 52,110 C 54,100 54,80 60,42 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'hood',
        )} {activePart === 'hood' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["hood"]}
        tabindex="0"
        onclick={() => (activePart = "hood")}
        onkeydown={e => handleKeyDown(e, "hood")}
      />

      <!-- Roof -->
      <rect
        x="50"
        y="114"
        width="100"
        height="134"
        rx="8"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'roof',
        )} {activePart === 'roof' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["roof"]}
        tabindex="0"
        onclick={() => (activePart = "roof")}
        onkeydown={e => handleKeyDown(e, "roof")}
      />

      <!-- Trunk -->
      <path
        d="M 58,252 L 142,252 C 138,270 138,298 138,320 L 62,320 C 62,298 62,270 58,252 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'trunk',
        )} {activePart === 'trunk' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["trunk"]}
        tabindex="0"
        onclick={() => (activePart = "trunk")}
        onkeydown={e => handleKeyDown(e, "trunk")}
      />

      <!-- Rear Bumper -->
      <path
        d="M 45,342 C 65,355 135,355 155,342 C 160,337 160,332 150,332 C 120,335 80,335 50,332 C 40,332 40,337 45,342 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'rear_bumper',
        )} {activePart === 'rear_bumper' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["rear_bumper"]}
        tabindex="0"
        onclick={() => (activePart = "rear_bumper")}
        onkeydown={e => handleKeyDown(e, "rear_bumper")}
      />

      <!-- Left Side Panels -->
      <!-- Front Fender -->
      <path
        d="M 38,40 C 36,60 36,80 38,98 L 52,98 C 52,80 54,55 58,40 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_fender',
        )} {activePart === 'left_fender' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_fender"]}
        tabindex="0"
        onclick={() => (activePart = "left_fender")}
        onkeydown={e => handleKeyDown(e, "left_fender")}
      />

      <!-- Front Door -->
      <path
        d="M 36,102 C 34,120 34,140 36,160 L 48,160 L 48,102 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_front_door',
        )} {activePart === 'left_front_door' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_front_door"]}
        tabindex="0"
        onclick={() => (activePart = "left_front_door")}
        onkeydown={e => handleKeyDown(e, "left_front_door")}
      />

      <!-- Rear Door -->
      <path
        d="M 36,164 C 34,184 34,210 36,228 L 48,228 L 48,164 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_rear_door',
        )} {activePart === 'left_rear_door' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_rear_door"]}
        tabindex="0"
        onclick={() => (activePart = "left_rear_door")}
        onkeydown={e => handleKeyDown(e, "left_rear_door")}
      />

      <!-- Rear Quarter -->
      <path
        d="M 38,232 C 36,252 38,280 38,320 L 59,320 C 59,298 59,270 55,254 Q 48,248 48,242 L 48,232 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_rear_quarter',
        )} {activePart === 'left_rear_quarter' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_rear_quarter"]}
        tabindex="0"
        onclick={() => (activePart = "left_rear_quarter")}
        onkeydown={e => handleKeyDown(e, "left_rear_quarter")}
      />

      <!-- Right Side Panels -->
      <!-- Front Fender -->
      <path
        d="M 162,40 C 164,60 164,80 162,98 L 148,98 C 148,80 146,55 142,40 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_fender',
        )} {activePart === 'right_fender' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_fender"]}
        tabindex="0"
        onclick={() => (activePart = "right_fender")}
        onkeydown={e => handleKeyDown(e, "right_fender")}
      />

      <!-- Front Door -->
      <path
        d="M 164,102 C 166,120 166,140 164,160 L 152,160 L 152,102 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_front_door',
        )} {activePart === 'right_front_door' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_front_door"]}
        tabindex="0"
        onclick={() => (activePart = "right_front_door")}
        onkeydown={e => handleKeyDown(e, "right_front_door")}
      />

      <!-- Rear Door -->
      <path
        d="M 164,164 C 166,184 166,210 164,228 L 152,228 L 152,164 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_rear_door',
        )} {activePart === 'right_rear_door' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_rear_door"]}
        tabindex="0"
        onclick={() => (activePart = "right_rear_door")}
        onkeydown={e => handleKeyDown(e, "right_rear_door")}
      />

      <!-- Rear Quarter -->
      <path
        d="M 162,232 C 164,252 162,280 162,320 L 141,320 C 141,298 141,270 145,254 Q 152,248 152,242 L 152,232 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_rear_quarter',
        )} {activePart === 'right_rear_quarter' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_rear_quarter"]}
        tabindex="0"
        onclick={() => (activePart = "right_rear_quarter")}
        onkeydown={e => handleKeyDown(e, "right_rear_quarter")}
      />

      <!-- Labels inside SVG -->
      <text
        x="100"
        y="32"
        font-size="8"
        fill="#94a3b8"
        text-anchor="middle"
        font-weight="bold"
        pointer-events="none">FRENTE</text
      >
      <text
        x="100"
        y="348"
        font-size="8"
        fill="#94a3b8"
        text-anchor="middle"
        font-weight="bold"
        pointer-events="none">TRASEIRA</text
      >
    </svg>
    </div>
  </div>

  <div class="flex flex-col gap-3 lg:min-w-48">
    {#each [['interior', 'Interior da cabine'], ['windows', 'Vidros'], ['headlights', 'Faróis']] as [category, label] (category)}
      {@const count = countDamages({ [category]: partStates[category] })}
      <button class="btn damage-category" type="button" data-category={category}
        aria-label={count ? `${label}, ${count} ${count === 1 ? 'item com dano' : 'itens com danos'}` : label}
        onclick={() => (activePart = category)}>
        <span>{label}</span>
        {#if count > 0}<span class="damage-indicator" aria-hidden="true">{count}</span>{/if}
      </button>
    {/each}
  </div>
</div>

<style>
  .diagram-viewport {
    touch-action: pan-x pan-y;
  }
  .damage-category {
    justify-content: space-between;
    gap: 12px;
  }
  .damage-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 22px;
    height: 22px;
    padding: 0 6px;
    border-radius: 999px;
    background: #b91c1c;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
  }
</style>
