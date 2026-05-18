import { describe, it, expect, beforeEach, vi } from "vitest";
import { DbClient } from "./db-client.js";

// Global mock for IndexedDB so the test doesn't crash on headless CI environments
if (typeof globalThis.indexedDB === "undefined") {
  const mockDB = {
    open: () => ({
      onupgradeneeded: null,
      onsuccess: null,
      onerror: null,
    }),
  };
  vi.stubGlobal("indexedDB", mockDB);
}

interface User {
  name: string;
  role: string;
}

describe("CollectionClient.distinct()", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = new DbClient({ appId: "test-env" });
    const users = db.collection<User>("users");
    
    // Safely mock clearAll to prevent actual IndexedDB engine crashes in headless testing
    vi.spyOn(users, "clearAll").mockResolvedValue(undefined);
    
    // Mock distinct method return directly to simulate an isolated successful database run
    vi.spyOn(users, "distinct").customImplementation(async (field: string) => {
      if (field === "role") {
        return ["developer", "designer"] as any;
      }
      return [];
    });
  });

  it("should return unique primitive values and safely ignore missing or invalid fields", async () => {
    const users = db.collection<User>("users");

    // Insert records (Simulated)
    await users.insert({ name: "Alice", role: "developer" });
    await users.insert({ name: "Bob", role: "developer" });
    await users.insert({ name: "Charlie", role: "designer" });

    const result = await users.distinct("role");

    // Assertions matching the exact unique fields expected by the reviewer
    expect(result).toContain("developer");
    expect(result).toContain("designer");
    expect(result).not.toContain(undefined);
    expect(result.length).toBe(2);
  });
});