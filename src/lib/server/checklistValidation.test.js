import { describe, expect, it } from "vitest";
import { validateChecklistPayload } from "./checklistValidation.js";

function validPayload(overrides = {}) {
  return {
    schemaVersion: 3,
    id: "ins-valid",
    ownerUid: "owner-a",
    licensePlate: "ABC1D23",
    inspectionType: "Entrega",
    inspectorName: "Inspetor",
    clientName: "Cliente",
    contactId: 'contact-id',
    clientSignatureName: 'Cliente',
    inspectionDateTime: "2026-08-31T12:00:00.000Z",
    clientLicensePhoto: "https://storage.example/license.jpg",
    clientLicensePhotoPath: "checklists/owner-a/ins-valid/license.jpg",
    clientSignature: "https://storage.example/signature.png",
    clientSignaturePath: "checklists/owner-a/ins-valid/signature.png",
    carDiagramImage: "",
    carDiagramImagePath: "",
    mileage: "10.000",
    fuelLevel: "4/8",
    hasDocument: true,
    hasChildSeat: false,
    hasEToll: false,
    partStates: {
      hood: {
        status: "scratch",
        comments: "Leve",
        photos: ["https://storage.example/hood.jpg"],
        photoPaths: ["checklists/owner-a/ins-valid/parts/hood/0.jpg"],
      },
    },
    status: "completed",
    synced: true,
    ...overrides,
  };
}

describe("checklist server validation", () => {
  it('requires a contact and signer in version 3, leaving the UID for authoritative resolution', () => {
    const payload = validPayload({ schemaVersion: 3, contactId: 'contact-id', clientUid: 'forged', clientSignatureName: ' Representante ' });
    const report = validateChecklistPayload(payload, 'owner-a');
    expect(report).toMatchObject({ schemaVersion: 3, contactId: 'contact-id', clientUid: null, clientSignatureName: 'Representante' });
    for (const override of [{ contactId: null }, { contactId: '../unsafe' }, { clientSignatureName: '   ' }, { clientSignatureName: 'A'.repeat(201) }]) {
      expect(() => validateChecklistPayload({ ...payload, ...override }, 'owner-a')).toThrow();
    }
  });

  it.each([undefined, 1, 2, 4])('rejects unsupported schema version %s', schemaVersion => {
    expect(() => validateChecklistPayload(validPayload({ schemaVersion }), 'owner-a')).toThrow('Unsupported inspection schema version.');
  });
  it("accepts and normalizes a bounded owner-scoped report", () => {
    const report = validateChecklistPayload(validPayload(), "owner-a");
    expect(report.licensePlate).toBe("ABC1D23");
    expect(report.partStates.hood.photos).toHaveLength(1);
  });

  it("accepts a Devolução report with delivery link and snapshot", () => {
    const payload = validPayload({
      inspectionType: "Devolução",
      deliveryChecklistId: "ins-delivery-123",
      newDamageCount: 1,
      deliverySnapshot: {
        id: "ins-delivery-123",
        inspectionDateTime: "2026-08-30T10:00:00.000Z",
        inspectorName: "Inspetor Carlos",
        clientName: "Cliente",
        mileage: "9.000",
        fuelLevel: "8/8",
        hasDocument: true,
        hasChildSeat: false,
        hasEToll: false,
        partStates: {
          hood: {
            status: "scratch",
            comments: "Leve",
            photos: ["https://storage.example/hood.jpg"],
          },
        },
      },
      partStates: {
        hood: {
          status: "scratch",
          comments: "Mantido",
          photos: ["https://storage.example/hood.jpg"],
          photoPaths: ["checklists/owner-a/ins-valid/parts/hood/0.jpg"],
          isNewDamage: false,
          deliveryStatus: "scratch",
          deliveryComments: "Leve",
          deliveryPhotos: ["https://storage.example/hood.jpg"],
        },
        front_bumper: {
          status: "dent",
          comments: "Novo amassado",
          photos: ["https://storage.example/bumper.jpg"],
          photoPaths: ["checklists/owner-a/ins-valid/parts/front_bumper/0.jpg"],
          isNewDamage: true,
        },
      },
    });
    const report = validateChecklistPayload(payload, "owner-a");
    expect(report.inspectionType).toBe("Devolução");
    expect(report.deliveryChecklistId).toBe("ins-delivery-123");
    expect(report.deliverySnapshot?.mileage).toBe("9.000");
    expect(report.partStates.front_bumper.isNewDamage).toBe(true);
    expect(report.partStates.hood.isNewDamage).toBe(false);
  });

  it("accepts a Devolução report when CNH is reused from delivery (empty clientLicensePhotoPath)", () => {
    const payload = validPayload({
      inspectionType: "Devolução",
      deliveryChecklistId: "ins-delivery-123",
      clientLicensePhoto: "https://storage.example/existing-license.jpg",
      clientLicensePhotoPath: "",
    });
    const report = validateChecklistPayload(payload, "owner-a");
    expect(report.clientLicensePhotoPath).toBe("");
  });

  it("accepts a Devolução report when new CNH photo is uploaded", () => {
    const payload = validPayload({
      inspectionType: "Devolução",
      deliveryChecklistId: "ins-delivery-123",
      clientLicensePhoto: "https://storage.example/new-license.jpg",
      clientLicensePhotoPath: "checklists/owner-a/ins-valid/license.jpg",
    });
    const report = validateChecklistPayload(payload, "owner-a");
    expect(report.clientLicensePhotoPath).toBe("checklists/owner-a/ins-valid/license.jpg");
  });

  it("rejects an Entrega report with empty clientLicensePhotoPath", () => {
    const payload = validPayload({
      inspectionType: "Entrega",
      clientLicensePhoto: "https://storage.example/license.jpg",
      clientLicensePhotoPath: "",
    });
    expect(() => validateChecklistPayload(payload, "owner-a")).toThrow(
      "Invalid license photo path.",
    );
  });

  it("rejects a Devolução report with invalid clientLicensePhotoPath prefix", () => {
    const payload = validPayload({
      inspectionType: "Devolução",
      deliveryChecklistId: "ins-delivery-123",
      clientLicensePhoto: "https://storage.example/license.jpg",
      clientLicensePhotoPath: "checklists/other-user/other-ins/license.jpg",
    });
    expect(() => validateChecklistPayload(payload, "owner-a")).toThrow(
      "Invalid license photo path.",
    );
  });

  it.each([
    ["owner spoofing", { ownerUid: "owner-b" }],
    ["data URL", { clientLicensePhoto: "data:image/jpeg;base64,AA==" }],
    ["path traversal", { clientLicensePhotoPath: "checklists/owner-a/../secret.jpg" }],
    [
      "invalid status",
      { partStates: { hood: { status: "hacked", comments: "", photos: [], photoPaths: [] } } },
    ],
    ["schema pollution", { extraData: "forged" }],
    ["old Retirada type is rejected", { inspectionType: "Retirada" }],
  ])("rejects %s", (_name, override) => {
    expect(() => validateChecklistPayload(validPayload(override), "owner-a")).toThrow();
  });

  it("rejects mismatched and oversized photo lists", () => {
    const photos = Array.from({ length: 7 }, (_, index) => `https://storage.example/${index}.jpg`);
    const photoPaths = photos.map(
      (_, index) => `checklists/owner-a/ins-valid/parts/hood/${index}.jpg`,
    );
    expect(() =>
      validateChecklistPayload(
        validPayload({
          partStates: { hood: { status: "scratch", comments: "", photos, photoPaths } },
        }),
        "owner-a",
      ),
    ).toThrow();
  });
});
