import { json } from "@sveltejs/kit";
import { adminDb } from "$lib/server/admin";
import { ApiError, apiErrorResponse, hasPermission, requireAuth } from "$lib/server/auth";

export async function GET({ request, url }) {
  try {
    const decodedToken = await requireAuth(request);
    if (
      !hasPermission(decodedToken, "operations", "read") &&
      !hasPermission(decodedToken, "administrator", "read")
    ) {
      throw new ApiError(403, "Insufficient permissions.");
    }

    const rawPlate = (url.searchParams.get("plate") || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    if (rawPlate.length !== 7) {
      throw new ApiError(400, "Informe uma placa válida com 7 caracteres.");
    }

    // Query all checklists for the plate using the automatic single-field index
    // Filter out deliveries that have already been closed by a completed return checklist
    const snapshot = await adminDb
      .collection("checklists")
      .where("licensePlate", "==", rawPlate)
      .get();

    const closedDeliveryIds = new Set();
    const deliveryDocs = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();
      if (
        data.inspectionType === "Devolução" &&
        data.status === "completed" &&
        typeof data.deliveryChecklistId === "string" &&
        data.deliveryChecklistId.length > 0
      ) {
        closedDeliveryIds.add(data.deliveryChecklistId);
      } else if (data.inspectionType === "Entrega") {
        deliveryDocs.push(doc);
      }
    }

    const openDeliveries = deliveryDocs
      .filter(doc => !closedDeliveryIds.has(doc.id))
      .map(doc => {
        const data = doc.data();
        const inspectionDateTime = data.inspectionDateTime?.toDate?.()
          ? data.inspectionDateTime.toDate().toISOString()
          : data.inspectionDateTime || "";
        const createdAt = data.createdAt?.toDate?.()
          ? data.createdAt.toDate().toISOString()
          : data.createdAt || "";
        const updatedAt = data.updatedAt?.toDate?.()
          ? data.updatedAt.toDate().toISOString()
          : data.updatedAt || "";

        return {
          ...data,
          id: doc.id,
          inspectionDateTime,
          createdAt,
          updatedAt,
        };
      })
      .sort(
        (a, b) =>
          new Date(b.inspectionDateTime || b.createdAt || 0).getTime() -
          new Date(a.inspectionDateTime || a.createdAt || 0).getTime(),
      );

    return json({ deliveries: openDeliveries }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("Delivery lookup failed:", error);
    return apiErrorResponse(error);
  }
}
