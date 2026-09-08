<script>
  import { PART_NAMES } from "$lib/inspection.js";
  // Svelte 5 Runes for properties
  let { activePart = $bindable(), partStates = {} } = $props();
  let svgElement;

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
  <div class="relative w-full max-w-55 aspect-2/5 p-0 flex items-center justify-center mx-auto">
    <!-- Dynamic Interactive Car SVG Outline -->
    <svg bind:this={svgElement} viewBox="20 0 160 400" class="w-full h-full select-none">
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
        d="M 48,42 L 152,42 C 158,80 155,100 148,110 L 52,110 C 45,100 42,80 48,42 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'hood',
        )} {activePart === 'hood' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["hood"]}
        tabindex="0"
        onclick={() => (activePart = "hood")}
        onkeydown={e => handleKeyDown(e, "hood")}
      />

      <!-- Windshield -->
      <path
        d="M 54,114 L 146,114 C 143,128 138,135 132,138 L 68,138 C 62,135 57,128 54,114 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'windshield',
        )} {activePart === 'windshield' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["windshield"]}
        tabindex="0"
        onclick={() => (activePart = "windshield")}
        onkeydown={e => handleKeyDown(e, "windshield")}
      />

      <!-- Roof -->
      <rect
        x="58"
        y="142"
        width="84"
        height="85"
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

      <!-- Left Front Window -->
      <rect
        x="49"
        y="144"
        width="7"
        height="38"
        rx="2"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_front_window',
        )} {activePart === 'left_front_window' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_front_window"]}
        tabindex="0"
        onclick={() => (activePart = "left_front_window")}
        onkeydown={e => handleKeyDown(e, "left_front_window")}
      />

      <!-- Left Rear Window -->
      <rect
        x="49"
        y="186"
        width="7"
        height="38"
        rx="2"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'left_rear_window',
        )} {activePart === 'left_rear_window' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["left_rear_window"]}
        tabindex="0"
        onclick={() => (activePart = "left_rear_window")}
        onkeydown={e => handleKeyDown(e, "left_rear_window")}
      />

      <!-- Right Front Window -->
      <rect
        x="144"
        y="144"
        width="7"
        height="38"
        rx="2"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_front_window',
        )} {activePart === 'right_front_window' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_front_window"]}
        tabindex="0"
        onclick={() => (activePart = "right_front_window")}
        onkeydown={e => handleKeyDown(e, "right_front_window")}
      />

      <!-- Right Rear Window -->
      <rect
        x="144"
        y="186"
        width="7"
        height="38"
        rx="2"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'right_rear_window',
        )} {activePart === 'right_rear_window' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["right_rear_window"]}
        tabindex="0"
        onclick={() => (activePart = "right_rear_window")}
        onkeydown={e => handleKeyDown(e, "right_rear_window")}
      />

      <!-- Rear Glass -->
      <path
        d="M 54,248 L 146,248 C 143,234 138,230 132,230 L 68,230 C 62,230 57,234 54,248 Z"
        class="transition-colors duration-300 cursor-pointer focus:outline-none focus:stroke-blue-500 {getSVGPartColor(
          'rear_glass',
        )} {activePart === 'rear_glass' ? 'stroke-blue-500 stroke-[2px]' : 'stroke-1'}"
        role="button"
        aria-label={PART_NAMES["rear_glass"]}
        tabindex="0"
        onclick={() => (activePart = "rear_glass")}
        onkeydown={e => handleKeyDown(e, "rear_glass")}
      />

      <!-- Trunk -->
      <path
        d="M 48,252 L 152,252 C 158,285 155,300 148,320 L 52,320 C 45,300 42,285 48,252 Z"
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
        d="M 38,40 C 36,60 36,80 38,98 L 44,98 C 42,80 44,55 46,40 Z"
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
        d="M 38,232 C 36,252 36,280 38,320 L 46,320 C 44,285 44,250 48,232 Z"
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
        d="M 162,40 C 164,60 164,80 162,98 L 156,98 C 158,80 156,55 154,40 Z"
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
        d="M 162,232 C 164,252 164,280 162,320 L 154,320 C 156,285 156,250 152,232 Z"
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

  <button class="btn" type="button" onclick={() => (activePart = "interior")}
    >Interior da cabine</button
  >
</div>
