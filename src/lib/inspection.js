export const CHECKLIST_SCHEMA_VERSION = 5;

export const PART_NAMES = Object.freeze({
  front_bumper: "Parachoque Dianteiro",
  hood: "Capô",
  roof: "Teto",
  trunk: "Porta-Malas / Traseira",
  rear_bumper: "Parachoque Traseiro",
  left_fender: "Paralama Diant. Esq.",
  left_front_door: "Porta Diant. Esq.",
  left_rear_door: "Porta Tras. Esq.",
  left_rear_quarter: "Lateral Tras. Esq.",
  right_fender: "Paralama Diant. Dir.",
  right_front_door: "Porta Diant. Dir.",
  right_rear_door: "Porta Tras. Dir.",
  right_rear_quarter: "Lateral Tras. Dir.",
  interior: "Interior da Cabine",
  windows: "Vidros",
  headlights: 'Faróis',
  left_front_wheel: "Roda Diant. Esq.",
  right_front_wheel: "Roda Diant. Dir.",
  left_rear_wheel: "Roda Tras. Esq.",
  right_rear_wheel: "Roda Tras. Dir.",
});

export const STATUS_LABELS = Object.freeze({
  none: "Sem Danos",
  scratch: "Risco",
  dent: "Amassado",
  crack: "Trincado",
  broken: "Quebrado",
  damaged: "Danificado",
});

export function isItemCategory(category) {
  return category === 'interior' || category === 'windows' || category === 'headlights';
}

// Item keys stay stable across edits and delivery/return inspections.
export function partCategory(partId) {
  if (typeof partId !== 'string') return null;
  if (Object.hasOwn(PART_NAMES, partId)) return partId;
  return /^(interior|windows|headlights)_[A-Za-z0-9-]{1,64}$/.exec(partId)?.[1] || null;
}

export function isValidPartKey(partId) {
  const category = partCategory(partId);
  return Boolean(category && (!isItemCategory(category) || category !== partId));
}

export function partEntries(partStates, category) {
  if (!isItemCategory(category)) {
    return partStates && Object.hasOwn(partStates, category) ? [[category, partStates[category]]] : [];
  }
  return Object.entries(partStates?.[category] || {}).map(([id, state]) => [`${category}_${id}`, state]);
}

export function partStateEntries(partStates) {
  return Object.keys(partStates || {}).flatMap(category => partEntries(partStates, category));
}

export function getPartState(partStates, partId) {
  const category = partCategory(partId);
  if (category && category !== partId) return partStates?.[category]?.[partId.slice(category.length + 1)];
  return partStates?.[partId];
}

// Mutate the supplied map so callers can build a new map or update a single item.
export function setPartState(partStates, partId, state) {
  const category = partCategory(partId);
  if (category && category !== partId) {
    const id = partId.slice(category.length + 1);
    const group = { ...partStates[category] };
    if (state == null) delete group[id];
    else group[id] = state;
    if (Object.keys(group).length) partStates[category] = group;
    else delete partStates[category];
  } else if (state == null) {
    delete partStates[partId];
  } else {
    partStates[partId] = state;
  }
}

export function partName(partId, state = {}) {
  const category = partCategory(partId);
  return isItemCategory(category)
    ? `${PART_NAMES[category]} — ${state.name || 'Item'}`
    : PART_NAMES[partId] || partId;
}

export const STATUS_BADGE_STYLES = Object.freeze({
  scratch:
    "text-amber-600 border-amber-400/50 bg-amber-50 print:text-amber-600 print:border-amber-400",
  dent: "text-orange-600 border-orange-400/50 bg-orange-50 print:text-orange-600 print:border-orange-400",
  crack:
    "text-purple-600 border-purple-400/50 bg-purple-50 print:text-purple-600 print:border-purple-400",
  broken: "text-red-600 border-red-400/50 bg-red-50 print:text-red-600 print:border-red-400",
  damaged:
    "text-indigo-600 border-indigo-400/50 bg-indigo-50 print:text-indigo-600 print:border-indigo-400",
});

export function countDamages(partStates = {}) {
  return partStateEntries(partStates).filter(([, state]) => state?.status && state.status !== "none").length;
}

export function countNewDamages(partStates = {}) {
  return partStateEntries(partStates).filter(
    ([, state]) => state?.status && state.status !== "none" && state.isNewDamage,
  ).length;
}

export function detectNewDamages(returnPartStates = {}, deliveryPartStates = {}) {
  const newDamages = [];
  for (const [partId, state] of partStateEntries(returnPartStates)) {
    if (!state || !state.status || state.status === "none") continue;
    const deliveryState = getPartState(deliveryPartStates, partId);
    const hadDeliveryDamage = Boolean(deliveryState?.status && deliveryState.status !== "none");

    if (state.isNewDamage || !hadDeliveryDamage) {
      newDamages.push({
        partId,
        partName: partName(partId, state),
        status: state.status,
        comments: state.comments || "",
        photos: state.photos || [],
        isWorsened: hadDeliveryDamage,
        previousStatus: deliveryState?.status || state.deliveryStatus || "none",
        previousComments: deliveryState?.comments || state.deliveryComments || "",
        previousPhotos: deliveryState?.photos || state.deliveryPhotos || [],
      });
    }
  }
  return newDamages;
}

export function calculateMileageDiff(deliveryMileage, returnMileage) {
  const delDigits = String(deliveryMileage || "").replace(/\D/g, "");
  const retDigits = String(returnMileage || "").replace(/\D/g, "");
  if (!delDigits || !retDigits) return null;
  const diff = Number(retDigits) - Number(delDigits);
  return {
    raw: diff,
    formatted: formatMileage(Math.abs(diff)),
    isNegative: diff < 0,
  };
}

export function calculateFuelDiff(deliveryFuel, returnFuel) {
  if (!deliveryFuel || !returnFuel) return null;
  const parseFuel = f => {
    const [num] = String(f).split("/");
    return Number(num) || 0;
  };
  const del = parseFuel(deliveryFuel);
  const ret = parseFuel(returnFuel);
  const diff = ret - del;
  if (diff === 0) return { diff: 0, text: "Mesmo nível", badge: "neutral" };
  if (diff > 0) return { diff, text: `+${diff}/8 (Mais combustível)`, badge: "positive" };
  return { diff, text: `${diff}/8 (Menos combustível)`, badge: "warning" };
}

export function formatInspectionDateTime(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export function formatMileage(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits ? digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : "";
}

export function normalizeFirestoreDate(value) {
  if (!value) return "";
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (value.seconds != null) return new Date(value.seconds * 1000).toISOString();
  return value;
}

export function normalizeCloudInspection(data, id = data?.id) {
  if (!data) return null;
  return {
    ...data,
    id,
    inspectionDateTime: normalizeFirestoreDate(data.inspectionDateTime),
    createdAt: normalizeFirestoreDate(data.createdAt),
    updatedAt: normalizeFirestoreDate(data.updatedAt),
  };
}

export function buildChecklistSummary(report) {
  return {
    schemaVersion: report.schemaVersion,
    id: report.id,
    ownerUid: report.ownerUid,
    licensePlate: report.licensePlate,
    inspectionType: report.inspectionType,
    inspectorName: report.inspectorName,
    clientName: report.clientName,
    inspectionDateTime: report.inspectionDateTime,
    damageCount: countDamages(report.partStates),
    newDamageCount: countNewDamages(report.partStates),
    deliveryChecklistId: report.deliveryChecklistId || null,
    status: "completed",
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

export function safeAttachmentUrl(value) {
  if (typeof value !== "string") return "";
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

export function safeFileName(value, fallback = "arquivo") {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
  return cleaned || fallback;
}
