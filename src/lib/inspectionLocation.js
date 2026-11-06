const LOCATION_FIELDS = ['latitude', 'longitude', 'accuracy', 'capturedAt'];

export function isValidLocation(location) {
	if (!location || typeof location !== 'object' || Array.isArray(location)) return false;
	if (Object.keys(location).some(key => !LOCATION_FIELDS.includes(key))) return false;
	const { latitude, longitude, accuracy, capturedAt } = location;
	return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
		Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 &&
		Number.isFinite(accuracy) && accuracy >= 0 &&
		typeof capturedAt === 'string' && capturedAt.length === 24 &&
		Number.isFinite(Date.parse(capturedAt)) && new Date(capturedAt).toISOString() === capturedAt;
}

export function sameLocation(left, right) {
	return isValidLocation(left) && isValidLocation(right) &&
		LOCATION_FIELDS.every(field => left[field] === right[field]);
}

export function googleMapsUrl(location) {
	const params = new URLSearchParams({ api: '1', query: `${location.latitude},${location.longitude}` });
	return `https://www.google.com/maps/search/?${params}`;
}

export function staticMapUrl(location, apiKey) {
	if (!apiKey || !isValidLocation(location)) return '';
	const point = `${location.latitude},${location.longitude}`;
	const params = new URLSearchParams({
		center: point, markers: point, zoom: '16', size: '640x320', scale: '2', key: apiKey
	});
	return `https://maps.googleapis.com/maps/api/staticmap?${params}`;
}

function captureError(error) {
	if (error?.code === 1) return 'Permissão de localização negada. Habilite o acesso à localização nas configurações do navegador e tente novamente.';
	if (error?.code === 2) return 'Localização indisponível. Ative a localização do dispositivo e tente novamente.';
	if (error?.code === 3) return 'O tempo para obter a localização esgotou. Tente novamente.';
	return 'Não foi possível obter uma localização válida. Tente novamente.';
}

/** getCurrentPosition cannot be aborted. Serialize native requests and invalidate late results. */
export function createLocationCapture(onChange, getGeolocation = () => globalThis.navigator?.geolocation) {
	let generation = 0;
	let pending = null;
	let active = false;
	let disposed = false;
	return {
		async capture() {
			if (disposed || active) return;
			active = true;
			const current = ++generation;
			const isCurrent = () => !disposed && current === generation;
			onChange({ status: 'loading', location: null, error: '' });
			// A previous step may still have a native request awaiting permission or timeout.
			if (pending) await pending.catch(() => {});
			if (!isCurrent()) return;
			try {
				const geolocation = getGeolocation();
				if (!geolocation?.getCurrentPosition) {
					onChange({ status: 'error', location: null, error: 'A localização não está disponível neste navegador. Use um navegador compatível e acesse o app por HTTPS.' });
					return;
				}
				pending = new Promise((resolve, reject) => {
					geolocation.getCurrentPosition(resolve, reject, {
						enableHighAccuracy: true, maximumAge: 0, timeout: 15_000
					});
				});
				const position = await pending;
				if (!isCurrent()) return;
				const location = {
					latitude: position.coords.latitude,
					longitude: position.coords.longitude,
					accuracy: position.coords.accuracy,
					capturedAt: new Date(position.timestamp).toISOString()
				};
				if (!isValidLocation(location)) throw new Error('Invalid location');
				onChange({ status: 'success', location, error: '' });
			} catch (error) {
				if (isCurrent()) onChange({ status: 'error', location: null, error: captureError(error) });
			} finally {
				pending = null;
				if (isCurrent()) active = false;
			}
		},
		cancel() {
			generation++;
			active = false;
		},
		dispose() {
			generation++;
			disposed = true;
		}
	};
}
