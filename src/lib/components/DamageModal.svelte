<script>
	// Svelte 5 property bindings
	let {
		partId = $bindable(),
		partStates = $bindable(),
		partName = "",
	} = $props();

	// Local states for the active part
	let status = $state("none");
	let comments = $state("");
	let photos = $state([]);
	let activePreviewIndex = $state(null);

	// Update local states when partId changes
	$effect(() => {
		if (partId && partStates) {
			const state = partStates[partId] || {
				status: "none",
				comments: "",
				photos: [],
			};
			status = state.status || "none";
			comments = state.comments || "";
			photos = [...(state.photos || [])];
			activePreviewIndex = null;
		}
	});

	// Close modal
	function close() {
		activePreviewIndex = null;
		partId = null;
	}

	// Save changes back to partStates
	function save() {
		partStates[partId] = {
			status,
			comments,
			photos,
		};
		close();
	}

	// Handle standard file upload
	function handleFileUpload(e) {
		const files = e.target.files;
		if (!files) return;

		for (let i = 0; i < files.length; i++) {
			const file = files[i];
			const reader = new FileReader();
			reader.onload = (event) => {
				photos = [...photos, event.target.result];
			};
			reader.readAsDataURL(file);
		}
	}



</script>

{#if partId}
	<!-- Backdrop overlay -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-opacity duration-300"
		onclick={close}
		role="presentation"
	>
		<!-- Modal Content Card -->
		<div
			class="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] transition-all scale-100"
			onclick={(e) => e.stopPropagation()}
			role="presentation"
		>
			<!-- Modal Header -->
			<div
				class="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50"
			>
				<div>
					<span
						class="text-xs font-bold text-blue-600 uppercase tracking-widest"
						>Detalhes da Inspeção</span
					>
					<h2
						class="text-xl font-bold text-slate-900 mt-0.5"
					>
						{partName}
					</h2>
				</div>
				<button
					type="button"
					onclick={close}
					class="p-2 hover:bg-slate-100 :bg-slate-800 rounded-full text-slate-500 hover:text-slate-900 :text-slate-200 transition-colors cursor-pointer"
					aria-label="Close"
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
				</button>
			</div>

			<!-- Scrollable Content Body -->
			<div class="flex-1 overflow-y-auto p-6 space-y-6">
				<!-- Damage Status Select -->
				<div>
					<label
						class="block text-sm font-semibold text-slate-700 mb-3"
						for="damage-status"
					>
						Status do Dano
					</label>
					<div
						class="flex flex-wrap gap-2 sm:grid sm:grid-cols-6"
						id="damage-status"
					>
						{#each [{ val: "none", label: "Sem Danos", color: "border-emerald-500 text-emerald-600 hover:bg-emerald-50  :bg-emerald-500/10", active: "bg-emerald-50  border-emerald-500 text-emerald-800 " }, { val: "scratch", label: "Risco", color: "border-amber-500 text-amber-600 hover:bg-amber-50  :bg-amber-500/10", active: "bg-amber-50  border-amber-500 text-amber-800 " }, { val: "dent", label: "Amassado", color: "border-orange-500 text-orange-600 hover:bg-orange-50  :bg-orange-500/10", active: "bg-orange-50  border-orange-500 text-orange-800 " }, { val: "crack", label: "Trincado", color: "border-purple-500 text-purple-600 hover:bg-purple-50  :bg-purple-500/10", active: "bg-purple-50  border-purple-500 text-purple-800 " }, { val: "broken", label: "Quebrado", color: "border-red-500 text-red-600 hover:bg-red-50  :bg-red-500/10", active: "bg-red-50  border-red-500 text-red-800 " }, { val: "damaged", label: "Danificado", color: "border-indigo-500 text-indigo-600 hover:bg-indigo-50  :bg-indigo-500/10", active: "bg-indigo-50  border-indigo-500 text-indigo-800 " }] as option (option.val)}
							<button
								type="button"
								onclick={() => (status = option.val)}
								class="grow sm:grow-0 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all text-center cursor-pointer min-w-[100px] {status === option.val ? option.active : 'border-slate-200 bg-slate-50 text-slate-500 ' + option.color}"
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>

				<!-- Photos Section -->
				<div>
					<div class="flex justify-between items-center mb-3">
						<label
							for="photos"
							class="block text-sm font-semibold text-slate-700"
						>
							Fotos ({photos.length})
						</label>
					</div>

					<!-- Thumbnails Container -->
					<div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
						{#each photos as photo, i (photo)}
							<div
								role="button"
								tabindex="0"
								onclick={() => (activePreviewIndex = i)}
								onkeydown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										activePreviewIndex = i;
									}
								}}
								class="relative aspect-square bg-slate-100 border border-slate-200 rounded-2xl overflow-hidden group cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-blue-500"
							>
								<img
									src={photo}
									alt="Car Part state {i}"
									class="w-full h-full object-cover"
								/>

								<!-- Delete Overlay -->
								<button
									type="button"
									onclick={(e) => {
										e.stopPropagation();
										deletePhoto(i);
									}}
									class="absolute top-1.5 right-1.5 p-1 bg-red-600/80 hover:bg-red-600 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer duration-150"
									title="Excluir foto"
								>
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-4 w-4"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
										/>
									</svg>
								</button>
							</div>
						{/each}
						<!-- Upload Area Card -->
						<label
							class="border-2 border-dashed border-slate-200 hover:border-blue-500/65 :border-blue-500/60 bg-slate-50 hover:bg-slate-100 :bg-slate-900/40 rounded-2xl aspect-square flex flex-col items-center justify-center cursor-pointer transition-all gap-1.5 text-center px-2"
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-6 w-6 text-slate-400"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
							<span
								class="text-xs font-semibold text-slate-500"
								>Enviar Foto</span
							>
							<input
								type="file"
								accept="image/*"
								multiple
								class="hidden"
								onchange={handleFileUpload}
							/>
						</label>
					</div>
				</div>

				<!-- Lightbox Preview Overlay -->
				{#if activePreviewIndex !== null && photos[activePreviewIndex]}
					<div
						class="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md transition-opacity duration-300"
						onclick={() => (activePreviewIndex = null)}
						role="presentation"
					>
						<div
							class="relative max-w-2xl w-full flex flex-col items-center gap-6"
							onclick={(e) => e.stopPropagation()}
							role="presentation"
						>
							<img
								src={photos[activePreviewIndex]}
								alt="Large Preview"
								class="max-h-[70vh] max-w-full object-contain rounded-2xl border border-slate-800 shadow-2xl"
							/>

							<div class="flex gap-4">
								<button
									type="button"
									onclick={() => {
										deletePhoto(activePreviewIndex);
										activePreviewIndex = null;
									}}
									class="px-6 py-3 bg-red-600 hover:bg-red-500 text-white font-extrabold rounded-xl transition-all shadow-lg shadow-red-600/20 hover:shadow-red-600/30 cursor-pointer text-sm"
								>
									Excluir Foto
								</button>
								<button
									type="button"
									onclick={() => (activePreviewIndex = null)}
									class="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-700"
								>
									Fechar
								</button>
							</div>
						</div>
					</div>
				{/if}

				<!-- Comments Notes Section -->
				<div>
					<label
						class="block text-sm font-semibold text-slate-700 mb-2"
						for="inspection-comments"
					>
						Comentários / Observações do Inspetor
					</label>
					<textarea
						id="inspection-comments"
						bind:value={comments}
						placeholder="Descreva o dano"
						class="w-full h-28 bg-slate-50 border border-slate-200 focus:border-blue-500 :border-blue-500 rounded-2xl p-4 text-slate-900 placeholder-slate-400 focus:ring-1 focus:ring-blue-500 outline-none resize-none transition-all text-sm"
					></textarea>
				</div>
			</div>

			<!-- Modal Footer -->
			<div
				class="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center"
			>
				<button
					type="button"
					onclick={close}
					class="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 :bg-slate-700 text-slate-600 font-bold rounded-xl transition-all cursor-pointer text-sm border border-slate-200"
				>
					Cancelar
				</button>

				<button
					type="button"
					onclick={save}
					class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-500/20 hover:shadow-blue-500/30 cursor-pointer text-sm"
				>
					Salvar Alterações
				</button>
			</div>
		</div>
	</div>
{/if}
