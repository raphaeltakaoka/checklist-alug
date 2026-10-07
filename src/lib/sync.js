import { storage } from "$lib/firebaseStorage.js";
import { getInspection, saveInspection } from "$lib/db.js";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import { authenticatedFetch } from "$lib/api.js";

const UPLOAD_CONCURRENCY = 2;

async function dataUrlToBlob(value) {
  const response = await fetch(value);
  if (!response.ok) throw new Error("Could not prepare local media for upload.");
  return response.blob();
}

async function toBlob(value) {
  if (value instanceof Blob) return value;
  if (typeof value === "string" && value.startsWith("data:")) return dataUrlToBlob(value);
  return null;
}

function extensionFor(contentType) {
  return (
    {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/svg+xml": "svg",
    }[contentType] || "bin"
  );
}

function uploadBlob(path, blob) {
  const objectRef = ref(storage, path);
  const task = uploadBytesResumable(objectRef, blob, {
    contentType: blob.type || "application/octet-stream",
    cacheControl: "private,max-age=31536000,immutable",
  });
  return new Promise((resolve, reject) => {
    task.on("state_changed", undefined, reject, async () => {
      resolve({ url: await getDownloadURL(task.snapshot.ref), path });
    });
  });
}

async function runWithConcurrency(tasks, concurrency = UPLOAD_CONCURRENCY) {
  const results = new Array(tasks.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < tasks.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await tasks[index]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tasks.length) }, worker));
  return results;
}

function dateToISOString(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return (Number.isNaN(date.getTime()) ? fallback : date).toISOString();
}

function cleanPartStates(partStates = {}) {
  const clean = {};
  for (const [partKey, state] of Object.entries(partStates)) {
    if (!state || typeof state !== "object") continue;
    clean[partKey] = {
      status: state.status || "none",
      comments: String(state.comments || "").slice(0, 1000),
      photos: Array.isArray(state.photos) ? state.photos.filter(Boolean).slice(0, 6) : [],
      photoPaths: Array.isArray(state.photoPaths)
        ? state.photoPaths.filter(path => typeof path === "string").slice(0, 6)
        : [],
      isNewDamage: Boolean(state.isNewDamage),
      deliveryStatus: state.deliveryStatus || "",
      deliveryComments: String(state.deliveryComments || "").slice(0, 1000),
      deliveryPhotos: Array.isArray(state.deliveryPhotos)
        ? state.deliveryPhotos.filter(Boolean).slice(0, 6)
        : [],
    };
  }
  return clean;
}

async function uploadInspectionMedia(report) {
  const uploads = [];
  const addUpload = async (value, relativePath, apply) => {
    const blob = await toBlob(value);
    if (!blob) return;
    const extension = extensionFor(blob.type);
    const path = `checklists/${report.ownerUid}/${report.id}/${relativePath}.${extension}`;
    uploads.push(async () => {
      const uploaded = await uploadBlob(path, blob);
      apply(uploaded);
      return uploaded.path;
    });
  };

  await addUpload(report.clientLicensePhoto, "license", ({ url, path }) => {
    report.clientLicensePhoto = url;
    report.clientLicensePhotoPath = path;
  });
  await addUpload(report.clientSignature, "signature", ({ url, path }) => {
    report.clientSignature = url;
    report.clientSignaturePath = path;
  });
  await addUpload(report.carDiagramImage, "car-diagram", ({ url, path }) => {
    report.carDiagramImage = url;
    report.carDiagramImagePath = path;
  });

  for (const [partKey, state] of Object.entries(report.partStates || {})) {
    state.photoPaths = Array.isArray(state.photoPaths)
      ? state.photoPaths.slice(0, state.photos?.length || 0)
      : [];
    for (let index = 0; index < (state.photos || []).length; index += 1) {
      await addUpload(state.photos[index], `parts/${partKey}/${index}`, ({ url, path }) => {
        state.photos[index] = url;
        state.photoPaths[index] = path;
      });
    }
  }

  return runWithConcurrency(uploads);
}

function buildCloudReport(localReport) {
  return {
    schemaVersion: localReport.schemaVersion,
    id: localReport.id,
    ownerUid: localReport.ownerUid,
    licensePlate: String(localReport.licensePlate || "").toUpperCase(),
    inspectionType: localReport.inspectionType,
    inspectorName: String(localReport.inspectorName || "").slice(0, 120),
    clientName: String(localReport.clientName || "").slice(0, 200),
    contactId: localReport.contactId,
    clientUid: localReport.clientUid,
    clientSignatureName: localReport.clientSignatureName,
    inspectionDateTime: dateToISOString(localReport.inspectionDateTime),
    clientLicensePhoto: localReport.clientLicensePhoto || "",
    clientLicensePhotoPath: localReport.clientLicensePhotoPath || "",
    clientSignature: localReport.clientSignature || "",
    clientSignaturePath: localReport.clientSignaturePath || "",
    carDiagramImage: localReport.carDiagramImage || "",
    carDiagramImagePath: localReport.carDiagramImagePath || "",
    mileage: String(localReport.mileage || "").slice(0, 20),
    fuelLevel: localReport.fuelLevel,
    hasDocument: Boolean(localReport.hasDocument),
    hasChildSeat: Boolean(localReport.hasChildSeat),
    hasEToll: Boolean(localReport.hasEToll),
    partStates: cleanPartStates(localReport.partStates),
    deliveryChecklistId: localReport.deliveryChecklistId || null,
    deliverySnapshot: localReport.deliverySnapshot || null,
    newDamageCount: Number(localReport.newDamageCount || 0),
    status: "completed",
    synced: true,
  };
}

export async function syncInspectionToCloud(inspection) {
  const ownerUid = inspection?.ownerUid;
  if (!ownerUid || !inspection?.id) throw new Error("Inspection ownership is required for sync.");
  const hydrated = await getInspection(ownerUid, inspection.id);
  if (!hydrated) throw new Error("The local inspection could not be found.");
  if (hydrated.schemaVersion !== 3) throw new Error('Unsupported inspection schema version.');

  await saveInspection({
    ...hydrated,
    status: "completed",
    syncState: "uploading",
    lastSyncError: "",
  });

  try {
    await uploadInspectionMedia(hydrated);
    const response = await authenticatedFetch("/api/checklists/sync", {
      method: "POST",
      body: JSON.stringify(buildCloudReport(hydrated)),
    });
    const { report: cloudReport } = await response.json();

    const syncedReport = {
      ...hydrated,
      ...cloudReport,
      inspectionDateTime: hydrated.inspectionDateTime,
      createdAt: hydrated.createdAt,
      updatedAt: new Date().toISOString(),
      status: "synced",
      syncState: "synced",
      synced: true,
      retryCount: 0,
      lastSyncError: "",
    };
    await saveInspection(syncedReport);
    return syncedReport;
  } catch (error) {
    await saveInspection({
      ...hydrated,
      status: "completed",
      syncState: "error",
      synced: false,
      retryCount: Number(hydrated.retryCount || 0) + 1,
      lastSyncError: String(error?.message || error).slice(0, 500),
    });
    throw error;
  }
}

export const __syncTestUtils = { runWithConcurrency, extensionFor, cleanPartStates };
