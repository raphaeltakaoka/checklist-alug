const DB_NAME = "inspectionDB";
const DB_VERSION = 2;
const INSPECTION_STORE = "inspections";
const MEDIA_STORE = "inspectionMedia";
const SYNCED_RETENTION_LIMIT = 50;
const MEDIA_PREFIX = "idb-media:";

let connectionPromise;

function requireOwner(ownerUid) {
  if (typeof ownerUid !== "string" || ownerUid.length === 0) {
    throw new Error("An authenticated owner UID is required for local inspection data.");
  }
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error || new Error("IndexedDB transaction aborted."));
  });
}

function normalizeStorageError(error) {
  if (error?.name === "QuotaExceededError") {
    return new Error(
      "O armazenamento offline do dispositivo está cheio. Libere espaço e tente novamente.",
    );
  }
  return error;
}

export function openDB() {
  if (connectionPromise) return connectionPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available in this environment."));
  }

  connectionPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      connectionPromise = undefined;
      reject(request.error);
    };
    request.onblocked = () => {
      connectionPromise = undefined;
      reject(new Error("Close other Checklist Alug tabs to upgrade offline storage."));
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      // Version 1 records did not contain an owner and cannot be separated safely.
      if (database.objectStoreNames.contains(INSPECTION_STORE)) {
        database.deleteObjectStore(INSPECTION_STORE);
      }
      const inspections = database.createObjectStore(INSPECTION_STORE, {
        keyPath: ["ownerUid", "id"],
      });
      inspections.createIndex("ownerUid", "ownerUid");
      inspections.createIndex("ownerStatus", ["ownerUid", "status"]);
      inspections.createIndex("ownerUpdatedAt", ["ownerUid", "updatedAt"]);

      if (database.objectStoreNames.contains(MEDIA_STORE)) {
        database.deleteObjectStore(MEDIA_STORE);
      }
      const media = database.createObjectStore(MEDIA_STORE, {
        keyPath: ["ownerUid", "inspectionId", "key"],
      });
      media.createIndex("ownerInspection", ["ownerUid", "inspectionId"]);
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        connectionPromise = undefined;
      };
      resolve(database);
    };
  });

  return connectionPromise;
}

async function dataUrlToBlob(value) {
  const [header, encoded] = value.split(",", 2);
  const mimeType = header.match(/^data:([^;,]+)/)?.[1] || "application/octet-stream";
  if (!header.includes(";base64")) {
    return new Blob([new TextEncoder().encode(decodeURIComponent(encoded))], { type: mimeType });
  }
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mimeType });
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function extractMedia(report) {
  const storedReport = structuredClone(report);
  const media = [];
  const storeValue = async (key, value) => {
    if (!(value instanceof Blob) && !(typeof value === "string" && value.startsWith("data:"))) {
      return value;
    }
    const blob = value instanceof Blob ? value : await dataUrlToBlob(value);
    media.push({
      ownerUid: report.ownerUid,
      inspectionId: report.id,
      key,
      blob,
      contentType: blob.type || "application/octet-stream",
      size: blob.size,
      updatedAt: new Date().toISOString(),
    });
    return `${MEDIA_PREFIX}${key}`;
  };

  for (const field of ["clientLicensePhoto", "clientSignature", "carDiagramImage"]) {
    storedReport[field] = await storeValue(field, storedReport[field]);
  }
  for (const [partKey, state] of Object.entries(storedReport.partStates || {})) {
    if (!Array.isArray(state?.photos)) continue;
    state.photos = await Promise.all(
      state.photos.map((photo, index) => storeValue(`parts/${partKey}/${index}`, photo)),
    );
  }

  return { storedReport, media };
}

async function hydrateMedia(database, report) {
  if (!report) return null;
  const hydrated = structuredClone(report);
  const transaction = database.transaction(MEDIA_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const records = await requestResult(
    transaction
      .objectStore(MEDIA_STORE)
      .index("ownerInspection")
      .getAll([report.ownerUid, report.id]),
  );
  await completed;
  const mediaByKey = new Map(records.map(record => [record.key, record.blob]));
  const resolveValue = async value => {
    if (typeof value !== "string" || !value.startsWith(MEDIA_PREFIX)) return value;
    const blob = mediaByKey.get(value.slice(MEDIA_PREFIX.length));
    return blob ? blobToDataUrl(blob) : null;
  };

  for (const field of ["clientLicensePhoto", "clientSignature", "carDiagramImage"]) {
    hydrated[field] = await resolveValue(hydrated[field]);
  }
  for (const state of Object.values(hydrated.partStates || {})) {
    if (Array.isArray(state?.photos)) {
      state.photos = await Promise.all(state.photos.map(resolveValue));
    }
  }
  return hydrated;
}

function replaceStoredInspection(database, storedReport, media) {
  const transaction = database.transaction([INSPECTION_STORE, MEDIA_STORE], "readwrite");
  const completed = transactionComplete(transaction);
  const mediaStore = transaction.objectStore(MEDIA_STORE);
  const cursorRequest = mediaStore
    .index("ownerInspection")
    .openCursor([storedReport.ownerUid, storedReport.id]);

  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (cursor) {
      cursor.delete();
      cursor.continue();
      return;
    }
    for (const record of media) mediaStore.put(record);
    transaction.objectStore(INSPECTION_STORE).put(storedReport);
  };

  return completed;
}

export async function saveInspection(inspection) {
  requireOwner(inspection?.ownerUid);
  if (typeof inspection.id !== "string" || inspection.id.length === 0) {
    throw new Error("Inspection ID is required.");
  }

  try {
    const database = await openDB();
    const { storedReport, media } = await extractMedia({
      ...inspection,
      updatedAt: new Date().toISOString(),
    });
    await replaceStoredInspection(database, storedReport, media);
    await pruneSyncedInspections(inspection.ownerUid);
  } catch (error) {
    throw normalizeStorageError(error);
  }
}

export async function getInspection(ownerUid, id, options = {}) {
  requireOwner(ownerUid);
  const database = await openDB();
  const transaction = database.transaction(INSPECTION_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const report = await requestResult(transaction.objectStore(INSPECTION_STORE).get([ownerUid, id]));
  await completed;
  if (!report || options.includeMedia === false) return report || null;
  return hydrateMedia(database, report);
}

export async function getAllInspections(ownerUid, options = {}) {
  requireOwner(ownerUid);
  const database = await openDB();
  const transaction = database.transaction(INSPECTION_STORE, "readonly");
  const completed = transactionComplete(transaction);
  const records = await requestResult(
    transaction.objectStore(INSPECTION_STORE).index("ownerUid").getAll(ownerUid),
  );
  await completed;
  records.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0),
  );
  if (!options.includeMedia) return records;
  return Promise.all(records.map(record => hydrateMedia(database, record)));
}

export async function deleteInspection(ownerUid, id) {
  requireOwner(ownerUid);
  const database = await openDB();
  const transaction = database.transaction([INSPECTION_STORE, MEDIA_STORE], "readwrite");
  const completed = transactionComplete(transaction);
  transaction.objectStore(INSPECTION_STORE).delete([ownerUid, id]);
  const cursorRequest = transaction
    .objectStore(MEDIA_STORE)
    .index("ownerInspection")
    .openCursor([ownerUid, id]);
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    cursor.delete();
    cursor.continue();
  };
  await completed;
}

export async function findLocalDeliveryInspection(ownerUid, licensePlate) {
  requireOwner(ownerUid);
  const cleanPlate = (licensePlate || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (cleanPlate.length !== 7) return [];
  const inspections = await getAllInspections(ownerUid, { includeMedia: true });
  const plateInspections = inspections.filter(ins => ins.licensePlate === cleanPlate);
  const closedDeliveryIds = new Set(
    plateInspections
      .filter(
        ins =>
          ins.inspectionType === "Devolução" &&
          ins.status === "completed" &&
          typeof ins.deliveryChecklistId === "string" &&
          ins.deliveryChecklistId.length > 0,
      )
      .map(ins => ins.deliveryChecklistId),
  );

  return plateInspections
    .filter(
      ins =>
        ins.inspectionType === "Entrega" &&
        ins.status === "completed" &&
        !closedDeliveryIds.has(ins.id),
    )
    .sort(
      (a, b) =>
        new Date(b.inspectionDateTime || b.createdAt || 0).getTime() -
        new Date(a.inspectionDateTime || a.createdAt || 0).getTime(),
    );
}

async function pruneSyncedInspections(ownerUid) {
  const database = await openDB();
  const readTransaction = database.transaction(INSPECTION_STORE, "readonly");
  const completed = transactionComplete(readTransaction);
  const synced = await requestResult(
    readTransaction.objectStore(INSPECTION_STORE).index("ownerStatus").getAll([ownerUid, "synced"]),
  );
  await completed;
  if (synced.length <= SYNCED_RETENTION_LIMIT) return;

  synced.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  for (const report of synced.slice(SYNCED_RETENTION_LIMIT)) {
    await deleteInspection(ownerUid, report.id);
  }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { usage, quota, ratio: quota > 0 ? usage / quota : 0 };
}

async function resetForTests() {
  if (connectionPromise) {
    const database = await connectionPromise.catch(() => null);
    database?.close();
    connectionPromise = undefined;
  }
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB test reset was blocked."));
  });
}

export const __dbTestUtils = {
  DB_NAME,
  DB_VERSION,
  INSPECTION_STORE,
  MEDIA_STORE,
  resetForTests,
};
