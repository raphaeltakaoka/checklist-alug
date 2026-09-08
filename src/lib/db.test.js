import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  __dbTestUtils,
  deleteInspection,
  findLocalDeliveryInspection,
  getAllInspections,
  getInspection,
  openDB,
  saveInspection,
} from "./db.js";

beforeEach(async () => {
  await __dbTestUtils.resetForTests();
});

function report(ownerUid, id, overrides = {}) {
  return {
    ownerUid,
    id,
    status: "draft",
    createdAt: new Date().toISOString(),
    partStates: {},
    ...overrides,
  };
}

describe("owner-scoped inspection database", () => {
  it("deletes unowned version 1 records during the authorized upgrade", async () => {
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(__dbTestUtils.DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore("inspections", { keyPath: "id" });
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("inspections", "readwrite");
        transaction.objectStore("inspections").put({ id: "legacy", status: "draft" });
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
      };
    });

    const database = await openDB();
    expect(database.version).toBe(2);
    expect(await getAllInspections("owner-a")).toEqual([]);
  });

  it("isolates records belonging to different authenticated users", async () => {
    await saveInspection(report("owner-a", "one"));
    await saveInspection(report("owner-b", "two"));
    expect((await getAllInspections("owner-a")).map(item => item.id)).toEqual(["one"]);
    expect((await getAllInspections("owner-b")).map(item => item.id)).toEqual(["two"]);
    expect(await getInspection("owner-a", "two")).toBeNull();
  });

  it("stores media as Blobs outside inspection metadata and hydrates it on detail reads", async () => {
    const photo = new Blob(["photo-bytes"], { type: "image/jpeg" });
    await saveInspection(
      report("owner-a", "media", {
        clientLicensePhoto: photo,
        partStates: {
          hood: { status: "scratch", comments: "", photos: [photo] },
        },
      }),
    );
    const listRecord = (await getAllInspections("owner-a"))[0];
    expect(listRecord.clientLicensePhoto).toBe("idb-media:clientLicensePhoto");
    const detail = await getInspection("owner-a", "media");
    expect(detail.clientLicensePhoto).toMatch(/^data:image\/jpeg;base64,/);
    expect(detail.partStates.hood.photos[0]).toMatch(/^data:image\/jpeg;base64,/);
  });

  it("hydrates multiple media values after the IndexedDB transaction has closed", async () => {
    const photo = new Blob(["photo-bytes"], { type: "image/jpeg" });
    await saveInspection(
      report("owner-a", "delayed-media", {
        clientLicensePhoto: photo,
        clientSignature: new Blob(["signature"], { type: "image/png" }),
        partStates: { hood: { status: "scratch", comments: "", photos: [photo] } },
      }),
    );

    const originalArrayBuffer = Blob.prototype.arrayBuffer;
    Blob.prototype.arrayBuffer = async function () {
      await new Promise(resolve => setTimeout(resolve, 0));
      return originalArrayBuffer.call(this);
    };
    try {
      const detail = await getInspection("owner-a", "delayed-media");
      expect(detail.clientLicensePhoto).toMatch(/^data:image\/jpeg;base64,/);
      expect(detail.clientSignature).toMatch(/^data:image\/png;base64,/);
      expect(detail.partStates.hood.photos[0]).toMatch(/^data:image\/jpeg;base64,/);
    } finally {
      Blob.prototype.arrayBuffer = originalArrayBuffer;
    }
  });

  it("replaces stale media and deletes it with the inspection", async () => {
    await saveInspection(
      report("owner-a", "replace-media", {
        clientLicensePhoto: new Blob(["old"], { type: "image/jpeg" }),
      }),
    );
    await saveInspection(
      report("owner-a", "replace-media", {
        clientSignature: new Blob(["new"], { type: "image/png" }),
      }),
    );

    const database = await openDB();
    const readMedia = async () => {
      const transaction = database.transaction(__dbTestUtils.MEDIA_STORE, "readonly");
      return new Promise((resolve, reject) => {
        const request = transaction
          .objectStore(__dbTestUtils.MEDIA_STORE)
          .index("ownerInspection")
          .getAll(["owner-a", "replace-media"]);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    };

    expect((await readMedia()).map(item => item.key)).toEqual(["clientSignature"]);
    await deleteInspection("owner-a", "replace-media");
    expect(await readMedia()).toEqual([]);
  });

  it("retains drafts while pruning only old synced history", async () => {
    await saveInspection(report("owner-a", "draft-kept"));
    for (let index = 0; index < 51; index += 1) {
      await saveInspection(
        report("owner-a", `synced-${index}`, {
          status: "synced",
          updatedAt: new Date(2026, 0, index + 1).toISOString(),
        }),
      );
    }
    const records = await getAllInspections("owner-a");
    expect(records.filter(item => item.status === "synced")).toHaveLength(50);
    expect(records.some(item => item.id === "draft-kept")).toBe(true);
  });

  it("returns only the latest completed delivery inspection for a license plate", async () => {
    await saveInspection(
      report("owner-a", "delivery-old", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-01-10T10:00:00.000Z").toISOString(),
      }),
    );
    await saveInspection(
      report("owner-a", "delivery-new", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-02-15T14:00:00.000Z").toISOString(),
      }),
    );
    await saveInspection(
      report("owner-a", "delivery-other-car", {
        licensePlate: "XYZ9K99",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-03-01T10:00:00.000Z").toISOString(),
      }),
    );

    const results = await findLocalDeliveryInspection("owner-a", "abc-1d23");
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("delivery-new");
    expect(results[1].id).toBe("delivery-old");
  });

  it("excludes deliveries that have already been closed by a completed return checklist", async () => {
    await saveInspection(
      report("owner-a", "delivery-returned", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-01-10T10:00:00.000Z").toISOString(),
      }),
    );
    await saveInspection(
      report("owner-a", "return-completed", {
        licensePlate: "ABC1D23",
        inspectionType: "Devolução",
        status: "completed",
        deliveryChecklistId: "delivery-returned",
        inspectionDateTime: new Date("2026-01-15T14:00:00.000Z").toISOString(),
      }),
    );

    const results = await findLocalDeliveryInspection("owner-a", "ABC1D23");
    expect(results).toEqual([]);
  });

  it("does not close a delivery checklist when the return checklist is only a draft", async () => {
    await saveInspection(
      report("owner-a", "delivery-active", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-02-01T10:00:00.000Z").toISOString(),
      }),
    );
    await saveInspection(
      report("owner-a", "return-draft", {
        licensePlate: "ABC1D23",
        inspectionType: "Devolução",
        status: "draft",
        deliveryChecklistId: "delivery-active",
        inspectionDateTime: new Date("2026-02-05T14:00:00.000Z").toISOString(),
      }),
    );

    const results = await findLocalDeliveryInspection("owner-a", "ABC1D23");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("delivery-active");
  });

  it("returns only the open delivery when an older delivery was closed and a new delivery is open", async () => {
    // Cycle 1: delivery 1 + completed return 1
    await saveInspection(
      report("owner-a", "cycle1-delivery", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-01-01T10:00:00.000Z").toISOString(),
      }),
    );
    await saveInspection(
      report("owner-a", "cycle1-return", {
        licensePlate: "ABC1D23",
        inspectionType: "Devolução",
        status: "completed",
        deliveryChecklistId: "cycle1-delivery",
        inspectionDateTime: new Date("2026-01-05T10:00:00.000Z").toISOString(),
      }),
    );
    // Cycle 2: delivery 2 (open)
    await saveInspection(
      report("owner-a", "cycle2-delivery", {
        licensePlate: "ABC1D23",
        inspectionType: "Entrega",
        status: "completed",
        inspectionDateTime: new Date("2026-02-01T10:00:00.000Z").toISOString(),
      }),
    );

    const results = await findLocalDeliveryInspection("owner-a", "ABC1D23");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("cycle2-delivery");
  });
});
