import { describe, expect, it } from "vitest";
import {
  buildChecklistSummary,
  calculateFuelDiff,
  calculateMileageDiff,
  countDamages,
  detectNewDamages,
  formatInspectionDateTime,
  formatMileage,
  safeAttachmentUrl,
} from "./inspection.js";

describe("inspection helpers", () => {
  it("counts only actual damage states and builds lightweight summaries", () => {
    const report = {
      schemaVersion: 3,
      id: "one",
      ownerUid: "owner",
      licensePlate: "ABC1D23",
      inspectionType: "Entrega",
      inspectorName: "Ana",
      clientName: "Cliente",
      inspectionDateTime: "date",
      partStates: { hood: { status: "scratch" }, roof: { status: "none" } },
      createdAt: "created",
      updatedAt: "updated",
    };
    expect(countDamages(report.partStates)).toBe(1);
    expect(buildChecklistSummary(report)).toMatchObject({ damageCount: 1, ownerUid: "owner" });
  });

  it("accepts only HTTPS attachment URLs", () => {
    expect(safeAttachmentUrl("https://example.com/file.pdf")).toBe("https://example.com/file.pdf");
    expect(safeAttachmentUrl("javascript:alert(1)")).toBe("");
    expect(safeAttachmentUrl("data:text/html,hello")).toBe("");
  });

  it("formats inspection dates and mileage consistently", () => {
    expect(formatMileage("123456")).toBe("123.456");
    expect(formatInspectionDateTime("invalid")).toBe("N/A");
    expect(formatInspectionDateTime("2026-08-31T15:30:00.000Z")).not.toBe("N/A");
  });

  it("detects new and worsened damages accurately between delivery and return", () => {
    const deliveryParts = {
      hood: {
        status: "scratch",
        comments: "Risco leve",
        photos: ["https://storage.example/hood.jpg"],
      },
      roof: { status: "none" },
    };
    const returnParts = {
      hood: {
        status: "dent",
        comments: "Amassou",
        photos: ["https://storage.example/hood-new.jpg"],
        isNewDamage: true,
      },
      front_bumper: {
        status: "broken",
        comments: "Quebrado",
        photos: ["https://storage.example/bumper.jpg"],
        isNewDamage: true,
      },
      roof: { status: "none" },
    };

    const detected = detectNewDamages(returnParts, deliveryParts);
    expect(detected).toHaveLength(2);
    expect(detected.find(d => d.partId === "hood")?.isWorsened).toBe(true);
    expect(detected.find(d => d.partId === "front_bumper")?.isWorsened).toBe(false);
  });

  it("calculates mileage and fuel differences properly", () => {
    const mileageDiff = calculateMileageDiff("45.000", "46.250");
    expect(mileageDiff?.formatted).toBe("1.250");
    expect(mileageDiff?.isNegative).toBe(false);

    const fuelDiff = calculateFuelDiff("8/8", "6/8");
    expect(fuelDiff?.diff).toBe(-2);
    expect(fuelDiff?.badge).toBe("warning");

    const sameFuel = calculateFuelDiff("4/8", "4/8");
    expect(sameFuel?.diff).toBe(0);
    expect(sameFuel?.badge).toBe("neutral");
  });
});
