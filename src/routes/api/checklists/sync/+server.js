import { json } from "@sveltejs/kit";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, adminStorage } from "$lib/server/admin";
import {
  ApiError,
  apiErrorResponse,
  assertInspectionAccess,
  hasPermission,
  requireAuth,
} from "$lib/server/auth";
import {
  checklistSummary,
  collectChecklistStoragePaths,
  validateChecklistPayload,
} from "$lib/server/checklistValidation";
import { readJson } from "$lib/server/requestValidation";
import { contactSelection } from '$lib/server/contacts';
import { carSelection } from '$lib/server/cars';
import { sameLocation } from '$lib/inspectionLocation.js';
import { ensureChecklistLocationMap } from '$lib/server/checklistLocationMap.js';

export async function POST({ request }) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 250_000) throw new ApiError(413, "Inspection payload is too large.");
    const decodedToken = await requireAuth(request);
    if (
      !hasPermission(decodedToken, "operations", "create") &&
      !hasPermission(decodedToken, "operations", "write") &&
      !hasPermission(decodedToken, "administrator", "write")
    ) {
      throw new ApiError(403, "Insufficient permissions.");
    }
    const payload = await readJson(request);
    if (typeof payload?.id !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.id)) {
      throw new ApiError(400, "Invalid inspection ID.");
    }
    const detailRef = adminDb.collection("checklists").doc(payload.id);
    const summaryRef = adminDb.collection("checklist_summaries").doc(payload.id);
    let previousPaths = [];
    let report;

    await adminDb.runTransaction(async transaction => {
      const [existing, existingSummary] = await transaction.getAll(detailRef, summaryRef);
      const existingData = existing.exists
        ? existing.data()
        : existingSummary.exists
          ? existingSummary.data()
          : null;
      if (existingData) assertInspectionAccess(decodedToken, existingData, "write");
      else if (!hasPermission(decodedToken, 'operations', 'create')) {
        throw new ApiError(403, 'Insufficient permissions.');
      }

      const expectedOwnerUid = existingData?.ownerUid || decodedToken.uid;
      report = validateChecklistPayload(payload, expectedOwnerUid);
      const isInternal = report.inspectionType === "Interno";
      if (existingData && isInternal !== (existingData.inspectionType === "Interno")) {
        throw new ApiError(400, 'O tipo Interno não pode ser alterado após a sincronização.');
      }
      if (existing.exists && !sameLocation(existing.data().location, report.location)) {
        throw new ApiError(400, 'A localização de uma vistoria sincronizada não pode ser alterada.');
      }
      if (existing.exists && existing.data().location.mapImagePath) {
        report.location.mapImagePath = existing.data().location.mapImagePath;
      }
      if (!isInternal) {
        const contact = contactSelection(await transaction.get(adminDb.collection('contacts').doc(report.contactId)));
        report.clientUid = contact.uid;
      }
      if (report.inspectionType === "Devolução") {
        const deliveryIds = new Set([report.deliveryChecklistId, report.deliverySnapshot?.id].filter(Boolean));
        for (const deliveryId of deliveryIds) {
          if (!/^[A-Za-z0-9_-]{1,128}$/.test(deliveryId)) {
            throw new ApiError(400, 'ID de vistoria de entrega inválido.');
          }
          const delivery = await transaction.get(adminDb.collection("checklists").doc(deliveryId));
          if (delivery.data()?.inspectionType === "Interno") {
            throw new ApiError(400, 'Uma vistoria interna não pode ser vinculada a uma devolução.');
          }
        }
      }
      const car = carSelection(await transaction.get(adminDb.collection('cars').doc(report.carId)));
      if (car.plate !== report.licensePlate) {
        throw new ApiError(400, 'A placa não corresponde ao veículo vinculado. Selecione o veículo novamente.');
      }
      const now = Timestamp.now();
      report.inspectionDateTime = Timestamp.fromDate(report.inspectionDateTime);
      report.createdAt = existingData?.createdAt || now;
      report.updatedAt = now;
      previousPaths = collectChecklistStoragePaths(existing.data());

      transaction.set(detailRef, report);
      transaction.set(summaryRef, checklistSummary(report));
    });

    const nextPaths = collectChecklistStoragePaths(report);

    const stalePaths = previousPaths.filter(path => !nextPaths.includes(path));
    await Promise.allSettled(
      stalePaths.map(path => adminStorage.bucket().file(path).delete({ ignoreNotFound: true })),
    );

    // The location is already saved. Provider or Storage failures leave the PDF usable.
    try {
      if (!report.location.mapImagePath) {
        const path = await ensureChecklistLocationMap(detailRef, report);
        if (path) report.location.mapImagePath = path;
      }
    } catch {
      // Map generation has already logged the failed step.
    }

    return json(
      {
        success: true,
        report: {
          ...report,
          inspectionDateTime: report.inspectionDateTime.toDate().toISOString(),
          createdAt: report.createdAt.toDate().toISOString(),
          updatedAt: report.updatedAt.toDate().toISOString(),
        },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    if (!(error instanceof ApiError)) {
      console.error("Checklist sync failed:", error);
    } else {
      console.warn("Checklist sync rejected (400):", error.message);
    }
    return apiErrorResponse(error);
  }
}
