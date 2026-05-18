import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { DbClient } from "../../packages/db/src/db-client.js";

describe("CollectionClient — Pagination", () => {
  let db: DbClient;
  let currentAppId: string;

  beforeEach(() => {
    currentAppId = "test-pagination-" + Math.random().toString(36).slice(2);
    db = new DbClient({ appId: currentAppId });
  });

  afterEach(async () => {
    await db.dispose();
    const req = indexedDB.deleteDatabase(`zerithdb_${currentAppId}`);
    await new Promise<void>((resolve) => {
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
  });

  it("should support limit option", async () => {
    const col = db.collection<{ v: number }>("vals");
    await col.insertMany([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }]);

    const docs = await col.find({}, { limit: 2 });
    expect(docs).toHaveLength(2);
  });

  it("should support offset option", async () => {
    const col = db.collection<{ v: number }>("vals");
    await col.insertMany([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }]);

    const docs = await col.find({}, { offset: 3 });
    expect(docs).toHaveLength(2);
    // Since IDs are UUIDv7, they should be in insertion order roughly,
    // but Dexie default sort might be by primary key (_id).
    // Let's just check the values.
    const values = docs.map((d) => d.v).sort();
    expect(values).toEqual([4, 5]);
  });

  it("should support both limit and offset", async () => {
    const col = db.collection<{ v: number }>("vals");
    await col.insertMany([{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }, { v: 5 }]);

    const docs = await col.find({}, { offset: 1, limit: 2 });
    expect(docs).toHaveLength(2);
    const values = docs.map((d) => d.v).sort();
    expect(values).toEqual([2, 3]);
  });

  it("should work with filters and pagination", async () => {
    const col = db.collection<{ v: number; even: boolean }>("vals");
    await col.insertMany([
      { v: 1, even: false },
      { v: 2, even: true },
      { v: 3, even: false },
      { v: 4, even: true },
      { v: 5, even: false },
      { v: 6, even: true },
    ]);

    const docs = await col.find({ even: true }, { offset: 1, limit: 1 });
    expect(docs).toHaveLength(1);
    expect(docs[0].v).toBe(4);
  });
});
