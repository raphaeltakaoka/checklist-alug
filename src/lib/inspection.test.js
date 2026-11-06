import { describe, expect, it } from "vitest";
import {
  buildChecklistSummary,
  calculateFuelDiff,
  calculateMileageDiff,
  countDamages,
  countNewDamages,
  detectNewDamages,
  formatInspectionDateTime,
  formatMileage,
  safeAttachmentUrl,
  partEntries,
  partName,
} from "./inspection.js";

describe("inspection helpers", () => {
  it('keeps headlights independent and compares each item across delivery and return', () => {
    const delivery = { headlights_left: { name: 'Farol esquerdo', status: 'crack' }, headlights_right: { name: 'Farol direito', status: 'none' } };
    const returned = { ...delivery, headlights_left: { name: 'Farol dianteiro esquerdo', status: 'broken', isNewDamage: true } };
    expect(partEntries(returned, 'headlights')).toHaveLength(2);
    expect(countDamages(returned)).toBe(1);
    expect(detectNewDamages(returned, delivery)).toMatchObject([
      { partId: 'headlights_left', partName: 'Faróis — Farol dianteiro esquerdo', previousStatus: 'crack', isWorsened: true },
    ]);
  });
  it('counts each damaged item, preserves healthy items and matches renamed return items by key', () => {
    const parts = {
      interior_seat: { name: 'Banco', status: 'damaged' },
      interior_panel: { name: 'Painel', status: 'scratch' },
      glass_front: { name: 'Parabrisa', status: 'crack' },
      glass_left: { name: 'Vidro esquerdo', status: 'scratch' },
      glass_back: { name: 'Vidro traseiro', status: 'broken' },
      interior_rear: { name: 'Banco traseiro', status: 'none' },
    };
    expect(countDamages(parts)).toBe(5);
    expect(partEntries(parts, 'interior')).toHaveLength(3);
    const returned = { ...parts, glass_front: { ...parts.glass_front, name: 'Parabrisa dianteiro', status: 'broken', isNewDamage: true } };
    expect(detectNewDamages(returned, parts)).toMatchObject([
      { partId: 'glass_front', partName: 'Vidros — Parabrisa dianteiro', isWorsened: true, previousStatus: 'crack' },
    ]);
    expect(partName('interior_rear', parts.interior_rear)).toBe('Interior da Cabine — Banco traseiro');
    expect(buildChecklistSummary({ partStates: returned })).toMatchObject({ damageCount: 5, newDamageCount: 1 });
  });

  it.each([
    ['maintained', { glass_front: { status: 'crack' } }, { status: 'crack', isNewDamage: false }, 0, false],
    ['new', {}, { status: 'crack', isNewDamage: true }, 1, false],
    ['worsened', { glass_front: { status: 'crack' } }, { status: 'broken', isNewDamage: true }, 1, true],
  ])('counts unified glass damage once when %s on return', (_scenario, delivery, state, expectedNew, worsened) => {
    const parts = { glass_front: { ...state, name: 'Parabrisa', comments: 'Parabrisa e vidro lateral', photos: ['https://example.test/glass.jpg'] } };
    expect(countDamages(parts)).toBe(1);
    expect(countNewDamages(parts)).toBe(expectedNew);
    const detected = detectNewDamages(parts, delivery);
    expect(detected).toHaveLength(expectedNew);
    if (expectedNew) expect(detected[0]).toMatchObject({ partId: 'glass_front', partName: 'Vidros — Parabrisa', isWorsened: worsened });
    expect(buildChecklistSummary({ partStates: parts })).toMatchObject({ damageCount: 1, newDamageCount: expectedNew });
  });

  it("counts only actual damage states and builds lightweight summaries", () => {
    const report = {
      schemaVersion: 4,
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
