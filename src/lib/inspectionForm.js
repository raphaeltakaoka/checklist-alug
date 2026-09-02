/** Validation shared by step links, Continue, and final submission. */
export function inspectionErrors(report, throughStep = 1) {
	const errors = {};
	if (!/^[A-Z0-9]{7}$/.test(report.licensePlate || ''))
		errors.licensePlate = 'Informe os 7 caracteres da placa.';
	if (!report.clientName?.trim() || report.clientName.length > 200)
		errors.clientName = 'Informe o nome do cliente (até 200 caracteres).';
	if (!report.inspectorName?.trim() || report.inspectorName.length > 120)
		errors.inspectorName = 'Informe o nome do inspetor (até 120 caracteres).';
	if (
		!report.inspectionDateTime ||
		Number.isNaN(new Date(report.inspectionDateTime).getTime())
	)
		errors.inspectionDateTime = 'Informe uma data e hora válidas.';
	if (throughStep >= 2 && !String(report.mileage || '').replace(/\D/g, ''))
		errors.mileage = 'Informe a quilometragem do veículo.';
	if (throughStep >= 3) {
		const states = Object.values(report.partStates || {});
		if (
			states.some((part) => (part.photos?.length || 0) > 6) ||
			states.reduce((sum, part) => sum + (part.photos?.length || 0), 0) > 24
		)
			errors.partStates = 'Use até 6 fotos por peça e 24 fotos por vistoria.';
		if (states.some((part) => (part.comments?.length || 0) > 1000))
			errors.partStates = 'Use até 1.000 caracteres por descrição de dano.';
	}
	if (throughStep >= 4) {
		if (!report.clientLicensePhoto)
			errors.clientLicensePhoto = 'Adicione uma foto da CNH do cliente.';
		if (!report.clientSignature)
			errors.clientSignature =
				'Peça ao cliente para assinar antes de concluir.';
	}
	return errors;
}

export function firstErrorStep(errors) {
	if (
		['licensePlate', 'clientName', 'inspectorName', 'inspectionDateTime'].some(
			(key) => errors[key]
		)
	)
		return 1;
	if (errors.mileage) return 2;
	if (errors.partStates) return 3;
	return 4;
}

/** Serializes writes and seals the writer before completing an inspection. */
export function createInspectionWriter(save, onState = () => {}, delay = 800) {
	let tail = Promise.resolve();
	let timer;
	let sealed = false;
	let disposed = false;
	let version = 0;
	const state = (value, error = null) => {
		if (!disposed) onState(value, error);
	};
	function enqueue(report) {
		const current = ++version;
		state('saving');
		const write = tail.catch(() => {}).then(() => save(report));
		tail = write;
		write.then(
			() => {
				if (current === version) state('saved');
			},
			(error) => {
				if (current === version) state('error', error);
			}
		);
		return write;
	}
	return {
		schedule(snapshot) {
			if (sealed || disposed) return;
			clearTimeout(timer);
			version++;
			state('unsaved');
			timer = setTimeout(() => {
				if (!sealed && !disposed) {
					const report = snapshot();
					if (report) enqueue(report).catch(() => {});
				}
			}, delay);
		},
		cancelScheduled() {
			clearTimeout(timer);
			version++;
		},
		flush(report) {
			clearTimeout(timer);
			if (sealed || disposed) return tail;
			return enqueue(report);
		},
		async complete(report) {
			if (sealed || disposed)
				throw new Error('Esta vistoria já está sendo concluída.');
			sealed = true;
			clearTimeout(timer);
			try {
				await enqueue(report);
			} catch (error) {
				sealed = false;
				throw error;
			}
		},
		dispose() {
			disposed = true;
			clearTimeout(timer);
		}
	};
}
