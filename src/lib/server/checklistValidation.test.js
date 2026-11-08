import { describe, expect, it } from "vitest";
import { validateChecklistPayload } from "./checklistValidation.js";

function validPayload(overrides = {}) {
  return {
    schemaVersion: 5,
    location: { latitude: -23.55052, longitude: -46.633308, accuracy: 12, capturedAt: '2026-11-06T12:00:00.000Z' },
    id: "ins-valid",
    ownerUid: "owner-a",
    licensePlate: "ABC1D23",
    carId: 'car-id',
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
  it.each([undefined, null, '', '   ', 'x'.repeat(101)])('requires a bounded name for each item: %j', name => {
    for (const category of ['windows', 'interior', 'headlights']) {
      expect(() => validateChecklistPayload(validPayload({ partStates: {
        [category]: { first: { name, status: 'none', comments: '', photos: [], photoPaths: [] } },
      } }), 'owner-a')).toThrow();
    }
  });

  it.each(['glass', 'windows_front', 'interior_seat', 'headlights_left', 'unknown_item'])('rejects invalid item keys %s', key => {
    expect(() => validateChecklistPayload(validPayload({ partStates: {
      [key]: { name: 'Item', status: 'none', comments: '', photos: [], photoPaths: [] },
    } }), 'owner-a')).toThrow('Invalid inspection part.');
  });

  it('preserves independent named items, including healthy items and multiple photos per item', () => {
    const state = { status: 'crack', comments: 'Observação', photos: [], photoPaths: [] };
    const partStates = {
      windows: {
        front: { ...state, name: ' Parabrisa ' },
        left: { ...state, name: 'Vidro esquerdo', status: 'scratch' },
      },
      interior: {
        seat: { ...state, name: 'Banco', status: 'damaged' },
        panel: { ...state, name: 'Painel', status: 'none' },
      },
      headlights: {
        left: { ...state, name: 'Farol esquerdo', status: 'broken' },
        right: { ...state, name: 'Farol direito', status: 'none' },
      },
    };
    const report = validateChecklistPayload(validPayload({ partStates }), 'owner-a');
    expect(Object.keys(report.partStates)).toEqual(['windows', 'interior', 'headlights']);
    expect(report.partStates.windows.front.name).toBe('Parabrisa');
    expect(report.partStates.interior.panel.status).toBe('none');
    expect(report.partStates.headlights.left.name).toBe('Farol esquerdo');
    expect(report.partStates.headlights.right.status).toBe('none');
  });

  function glassState(count = 1) {
    return {
      name: 'Parabrisa',
      status: 'crack',
      comments: 'Trinca no parabrisa e risco no vidro lateral.',
      photos: Array.from({ length: count }, (_, index) => `https://storage.example/glass-${index}.jpg`),
      photoPaths: Array.from({ length: count }, (_, index) => `checklists/owner-a/ins-valid/parts/windows_front/${index}.jpg`),
    };
  }

  it.each(['none', 'scratch', 'dent', 'crack', 'broken', 'damaged'])('accepts a named glass item with status %s', status => {
    const glass = { ...glassState(), status };
    const report = validateChecklistPayload(validPayload({ partStates: { windows: { front: glass } } }), 'owner-a');
    expect(report.partStates).toMatchObject({ windows: { front: glass } });
    expect(Object.keys(report.partStates)).toEqual(['windows']);
  });

  it.each(['windshield', 'rear_glass', 'left_front_window', 'left_rear_window', 'right_front_window', 'right_rear_window'])('rejects removed glass identifier %s', partId => {
    expect(() => validateChecklistPayload(validPayload({ partStates: { [partId]: glassState() } }), 'owner-a'))
      .toThrow('Invalid inspection part.');
  });

  it('preserves window names in a linked delivery snapshot', () => {
    const glass = glassState();
    const report = validateChecklistPayload(validPayload({
      inspectionType: 'Devolução',
      deliveryChecklistId: 'delivery',
      deliverySnapshot: { id: 'delivery', partStates: { windows: { front: glass } } },
      partStates: { windows: { front: { ...glass, isNewDamage: false, deliveryStatus: 'crack' } } },
    }), 'owner-a');
    expect(report.deliverySnapshot.partStates).toEqual({ windows: { front: { name: glass.name, status: glass.status, comments: glass.comments, photos: glass.photos } } });
    expect(report.partStates.windows.front).toMatchObject({ isNewDamage: false, deliveryStatus: 'crack' });
  });

  it('limits glass to six photos and the complete inspection to 24 photos', () => {
    const glass = glassState(6);
    const stateFor = (partId, count) => {
      const state = glassState(count);
      const { name, ...rest } = state;
      return { ...rest, photoPaths: state.photoPaths.map(path => path.replace('/windows_front/', `/${partId}/`)) };
    };
    const partStates = {
      windows: { front: glass, left: { ...stateFor('windows_left', 6), name: 'Vidro esquerdo' } },
      hood: stateFor('hood', 6),
      headlights: { left: { ...stateFor('headlights_left', 6), name: 'Farol esquerdo' } },
    };
    expect(validateChecklistPayload(validPayload({ partStates }), 'owner-a').partStates.windows.front.photos).toHaveLength(6);
    expect(() => validateChecklistPayload(validPayload({ partStates: { windows: { front: glassState(7) } } }), 'owner-a'))
      .toThrow('Invalid damage photo count.');
    expect(() => validateChecklistPayload(validPayload({ partStates: { ...partStates, trunk: stateFor('trunk', 1) } }), 'owner-a'))
      .toThrow('Inspection contains too many photos.');
  });

  it.each([null, undefined, {}, { latitude: 91, longitude: 0, accuracy: 0, capturedAt: '2026-11-06T12:00:00.000Z' }])('rejects missing or invalid location %j', location => {
    expect(() => validateChecklistPayload(validPayload({ location }), 'owner-a')).toThrow('Localização inválida');
  });
  it('keeps location only in the complete report', () => {
    const payload = validPayload();
    expect(validateChecklistPayload(payload, 'owner-a').location).toEqual(payload.location);
  });
  it('requires a contact and signer in version 5, leaving the UID for authoritative resolution', () => {
    const payload = validPayload({ schemaVersion: 5, contactId: 'contact-id', clientUid: 'forged', clientSignatureName: ' Representante ' });
    const report = validateChecklistPayload(payload, 'owner-a');
    expect(report).toMatchObject({ schemaVersion: 5, contactId: 'contact-id', clientUid: null, clientSignatureName: 'Representante' });
    for (const override of [{ carId: null }, { carId: '../unsafe' }, { contactId: null }, { contactId: '../unsafe' }, { clientSignatureName: '   ' }, { clientSignatureName: 'A'.repeat(201) }]) {
      expect(() => validateChecklistPayload({ ...payload, ...override }, 'owner-a')).toThrow();
    }
  });

  it.each([undefined, 1, 2, 3, 4, 6])('rejects unsupported schema version %s', schemaVersion => {
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
