import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { DbClient } from "./db-client.js";

function createDb() {
  return new DbClient({ appId: "fractional-indexing-db-" + Math.random().toString(36).slice(2) });
}

describe("Collection moveBetween() and fractional indexing", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb();
  });

  it("handles inserting and ordering elements correctly", async () => {
    const list = db.collection("list");
    
    // Insert 3 documents without order
    const resA = await list.insert({ name: "Doc A" });
    const resB = await list.insert({ name: "Doc B" });
    const resC = await list.insert({ name: "Doc C" });

    const idA = resA.id;
    const idB = resB.id;
    const idC = resC.id;

    // 1. Move A to the start (before B)
    // beforeId = null, afterId = B
    const orderA = await list.moveBetween(idA, null, idB);
    expect(orderA).toBe("j");

    // 2. Move C to the middle (between A and B)
    const orderC = await list.moveBetween(idC, idA, idB);
    expect(orderC).toBe("o");

    // 3. Move B to the end (after C)
    const orderB = await list.moveBetween(idB, idC, null);
    expect(orderB).toBe("u");

    // Verify ordering by fetching and sorting
    const docs = await list.find();
    docs.sort((x, y) => ((x._order as string) < (y._order as string) ? -1 : 1));

    expect(docs[0]._id).toBe(idA);
    expect(docs[1]._id).toBe(idC);
    expect(docs[2]._id).toBe(idB);
  });

  it("throws when moving a document relative to itself", async () => {
    const list = db.collection("list");
    const res = await list.insert({ name: "Self" });
    
    await expect(list.moveBetween(res.id, res.id, null)).rejects.toThrow();
    await expect(list.moveBetween(res.id, null, res.id)).rejects.toThrow();
  });

  it("supports custom order key fields", async () => {
    const list = db.collection("list");
    const resA = await list.insert({ name: "A" });
    const resB = await list.insert({ name: "B" });

    const orderKey = "position";
    const posA = await list.moveBetween(resA.id, null, resB.id, orderKey);
    
    const docA = await list.findById(resA.id);
    expect(docA).toBeDefined();
    expect(docA?.[orderKey]).toBe(posA);
    expect(docA?._order).toBeUndefined(); // Should not set default _order key
  });

  it("successfully rebalances collection keys while preserving ordering", async () => {
    const list = db.collection("list");
    
    const res1 = await list.insert({ name: "1" });
    const res2 = await list.insert({ name: "2" });
    const res3 = await list.insert({ name: "3" });

    // Set manually bloated fractional keys to simulate collision extensions
    await (list as any).table.update(res1.id, { _order: "faaaaa" });
    await (list as any).table.update(res2.id, { _order: "faaaab" });
    await (list as any).table.update(res3.id, { _order: "faaaac" });

    // Perform manual rebalance
    await list.rebalance();

    const docs = await list.find();
    docs.sort((x, y) => ((x._order as string) < (y._order as string) ? -1 : 1));

    // Confirm that the IDs maintain exact relative order
    expect(docs[0]._id).toBe(res1.id);
    expect(docs[1]._id).toBe(res2.id);
    expect(docs[2]._id).toBe(res3.id);

    // Confirm keys are rebalanced to clean, short, evenly spaced strings
    expect(docs[0]._order).toBe("m");
    expect(docs[1]._order).toBe("t");
    expect(docs[2]._order).toBe("w");
  });
});
