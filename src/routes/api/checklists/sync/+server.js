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

export async function POST({ request }) {
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > 250_000) throw new ApiError(413, "Inspection payload is too large.");
    const decodedToken = await requireAuth(request);
    if (
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

      const expectedOwnerUid = existingData?.ownerUid || decodedToken.uid;
      report = validateChecklistPayload(payload, expectedOwnerUid);
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
