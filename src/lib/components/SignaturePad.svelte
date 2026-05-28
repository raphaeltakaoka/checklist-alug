<script>
	import { onMount } from 'svelte';

	// Svelte 5 property bindings
	let { signature = $bindable() } = $props();

	let canvas;
	let ctx;
	let drawing = false;
	let lastX = 0;
	let lastY = 0;

	onMount(() => {
		ctx = canvas.getContext('2d');
		setupCanvas();

		// Register touch events with passive: false to allow preventDefault
		canvas.addEventListener('touchstart', startDrawing, { passive: false });
		canvas.addEventListener('touchmove', draw, { passive: false });
		canvas.addEventListener('touchend', stopDrawing, { passive: false });

		// Handle resize
		window.addEventListener('resize', setupCanvas);
		return () => {
			canvas.removeEventListener('touchstart', startDrawing);
			canvas.removeEventListener('touchmove', draw);
			canvas.removeEventListener('touchend', stopDrawing);
			window.removeEventListener('resize', setupCanvas);
		};
	});

	function setupCanvas() {
		if (!canvas) return;
		
		// Back up the current signature if any
		const tempImage = signature;

		// Make it high-DPI friendly
		const rect = canvas.getBoundingClientRect();
		canvas.width = rect.width;
		canvas.height = rect.height;

		ctx.strokeStyle = '#3b82f6'; // Premium blue line
		ctx.lineWidth = 3;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';

		// Restore if there was a signature
		if (tempImage) {
			const img = new Image();
			img.onload = () => {
				ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			};
			img.src = tempImage;
		}
	}

	function getCoordinates(e) {
		const rect = canvas.getBoundingClientRect();
		let clientX, clientY;

		if (e.touches && e.touches.length > 0) {
			clientX = e.touches[0].clientX;
			clientY = e.touches[0].clientY;
		} else {
			clientX = e.clientX;
			clientY = e.clientY;
		}

		return {
			x: clientX - rect.left,
			y: clientY - rect.top
		};
	}

	function startDrawing(e) {
		if (e.cancelable) e.preventDefault();
		drawing = true;
		const coords = getCoordinates(e);
		lastX = coords.x;
		lastY = coords.y;
		
		// Draw a point immediately
		ctx.beginPath();
		ctx.arc(lastX, lastY, ctx.lineWidth / 2, 0, Math.PI * 2);
		ctx.fillStyle = ctx.strokeStyle;
		ctx.fill();
	}

	function draw(e) {
		if (!drawing) return;
		if (e.cancelable) e.preventDefault();
		const coords = getCoordinates(e);

		ctx.beginPath();
		ctx.moveTo(lastX, lastY);
		ctx.lineTo(coords.x, coords.y);
		ctx.stroke();

		lastX = coords.x;
		lastY = coords.y;
	}

	function stopDrawing() {
		if (!drawing) return;
		drawing = false;
		// Update signature binding with base64 representation
		signature = canvas.toDataURL('image/png');
	}

	function clearCanvas() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		signature = null;
	}
</script>

<div class="flex flex-col gap-3 w-full">
	<div class="relative w-full h-[180px] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
		<canvas
			bind:this={canvas}
			onmousedown={startDrawing}
			onmousemove={draw}
			onmouseup={stopDrawing}
			onmouseleave={stopDrawing}
			class="w-full h-full cursor-crosshair touch-none"
		></canvas>

		{#if !signature}
			<div class="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-slate-400 dark:text-slate-500 font-medium">
				Assine aqui com o dedo ou mouse
			</div>
		{/if}
	</div>

	<div class="flex justify-between items-center">
		<span class="text-xs text-slate-500 dark:text-slate-400">
			{#if signature}
				<span class="text-emerald-600 dark:text-emerald-400 font-semibold">✓ Assinatura Capturada</span>
			{:else}
				Aguardando assinatura
			{/if}
		</span>
		
		<button
			type="button"
			onclick={clearCanvas}
			class="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-750 rounded-lg transition-all cursor-pointer"
		>
			Limpar Assinatura
		</button>
	</div>
</div>

