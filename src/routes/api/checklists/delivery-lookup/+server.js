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

    // Query by plate and inspectionType using automatic single-field indexes
    // Sort in-memory to prevent missing composite index runtime errors
    const snapshot = await adminDb
      .collection("checklists")
      .where("licensePlate", "==", rawPlate)
      .where("inspectionType", "==", "Entrega")
      .get();

    const deliveries = snapshot.docs
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
          new Date(b.inspectionDateTime).getTime() - new Date(a.inspectionDateTime).getTime(),
      )
      .slice(0, 5);

    return json({ deliveries }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("Delivery lookup failed:", error);
    return apiErrorResponse(error);
  }
}
