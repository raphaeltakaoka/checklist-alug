const DB_NAME = 'inspectionDB';
const DB_VERSION = 1;
const STORE_NAME = 'inspections';

/**
 * Initializes and opens the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined') {
			reject(new Error('IndexedDB is only available in the browser environment.'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onerror = (event) => {
			console.error('Failed to open database:', event.target.error);
			reject(event.target.error);
		};

		request.onsuccess = (event) => {
			resolve(event.target.result);
		};

		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			if (!db.objectStoreNames.contains(STORE_NAME)) {
				db.createObjectStore(STORE_NAME, { keyPath: 'id' });
			}
		};
	});
}

/**
 * Retrieves all inspection records from IndexedDB.
 * @returns {Promise<Array>}
 */
export async function getAllInspections() {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.getAll();

		request.onsuccess = () => {
			// Sort inspections by creation date descending, fallback to id
			const list = request.result || [];
			list.sort((a, b) => {
				const dateA = new Date(a.createdAt || 0);
				const dateB = new Date(b.createdAt || 0);
				return dateB - dateA;
			});
			resolve(list);
		};

		request.onerror = () => {
			reject(request.error);
		};
	});
}

/**
 * Saves (adds or updates) an inspection record in IndexedDB.
 * @param {Object} inspection The inspection object to save.
 * @returns {Promise<void>}
 */
export async function saveInspection(inspection) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.put(inspection);

		request.onsuccess = () => {
			resolve();
		};

		request.onerror = () => {
			reject(request.error);
		};
	});
}

/**
 * Deletes an inspection record from IndexedDB.
 * @param {string} id The unique identifier of the inspection.
 * @returns {Promise<void>}
 */
export async function deleteInspection(id) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readwrite');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.delete(id);

		request.onsuccess = () => {
			resolve();
		};

		request.onerror = () => {
			reject(request.error);
		};
	});
}

/**
 * Retrieves a single inspection record by its ID.
 * @param {string} id The unique identifier of the inspection.
 * @returns {Promise<Object|null>}
 */
export async function getInspection(id) {
	const db = await openDB();
	return new Promise((resolve, reject) => {
		const transaction = db.transaction(STORE_NAME, 'readonly');
		const store = transaction.objectStore(STORE_NAME);
		const request = store.get(id);

		request.onsuccess = () => {
			resolve(request.result || null);
		};

		request.onerror = () => {
			reject(request.error);
		};
	});
}
