const objectUrls = new WeakMap();

export function mediaPreviewUrl(value) {
	if (!(value instanceof Blob)) return value || '';
	if (!objectUrls.has(value)) objectUrls.set(value, URL.createObjectURL(value));
	return objectUrls.get(value);
}

export function revokeMediaPreview(value) {
	if (!(value instanceof Blob)) return;
	const url = objectUrls.get(value);
	if (url) URL.revokeObjectURL(url);
	objectUrls.delete(value);
}
