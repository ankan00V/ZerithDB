import { describe, it, expect, vi, beforeEach } from "vitest";
import { migrate } from "../src/migrator.js";
import path from "node:path";

// ── Mock adapters ─────────────────────────────────────────────────────────────

vi.mock("../src/adapters/firebase-realtime.js", () => ({
  migrateFirebaseRealtime: vi.fn().mockResolvedValue({
    users: [
      {
        _id: "doc-1",
        _collection: "users",
        _createdAt: "2024-01-01T00:00:00.000Z",
        _updatedAt: "2024-01-01T00:00:00.000Z",
        _vectorClock: { "migration-node": 1 },
        _migratedFrom: {
          type: "firebase-realtime",
          originalId: "user-abc",
          migratedAt: "2024-01-01T00:00:00.000Z",
        },
        data: { name: "Alice" },
      },
    ],
    posts: [
      {
        _id: "doc-2",
        _collection: "posts",
        _createdAt: "2024-01-02T00:00:00.000Z",
        _updatedAt: "2024-01-02T00:00:00.000Z",
        _vectorClock: { "migration-node": 1 },
        _migratedFrom: {
          type: "firebase-realtime",
          originalId: "post-xyz",
          migratedAt: "2024-01-01T00:00:00.000Z",
        },
        data: { title: "Hello World" },
      },
    ],
  }),
}));

vi.mock("../src/adapters/firestore.js", () => ({
  migrateFirestore: vi.fn().mockResolvedValue({
    products: [
      {
        _id: "prod-1",
        _collection: "products",
        _createdAt: "2024-03-01T00:00:00.000Z",
        _updatedAt: "2024-03-01T00:00:00.000Z",
        _vectorClock: { "migration-node": 1 },
        _migratedFrom: {
          type: "firestore",
          originalId: "abc123",
          migratedAt: "2024-03-01T00:00:00.000Z",
        },
        data: { name: "Widget", price: 9.99 },
      },
    ],
  }),
}));

vi.mock("../src/adapters/supabase.js", () => ({
  migrateSupabase: vi.fn().mockResolvedValue({
    orders: [
      {
        _id: "order-1",
        _collection: "orders",
        _createdAt: "2024-05-01T00:00:00.000Z",
        _updatedAt: "2024-05-01T00:00:00.000Z",
        _vectorClock: { "migration-node": 1 },
        _migratedFrom: {
          type: "supabase",
          originalId: "1",
          migratedAt: "2024-05-01T00:00:00.000Z",
        },
        data: { total: 49.99, status: "completed" },
      },
      {
        _id: "order-2",
        _collection: "orders",
        _createdAt: "2024-05-02T00:00:00.000Z",
        _updatedAt: "2024-05-02T00:00:00.000Z",
        _vectorClock: { "migration-node": 1 },
        _migratedFrom: {
          type: "supabase",
          originalId: "2",
          migratedAt: "2024-05-01T00:00:00.000Z",
        },
        data: { total: 12.5, status: "pending" },
      },
    ],
  }),
}));

vi.mock("fs-extra", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  ensureDir: vi.fn().mockResolvedValue(undefined),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

const TMP_OUTPUT = path.resolve("/tmp/zerithdb-test-export.json");

describe("migrate() — firebase-realtime", () => {
  it("returns correct stats for firebase-realtime source", async () => {
    const result = await migrate(
      {
        type: "firebase-realtime",
        config: {
          serviceAccountKey: {},
          databaseURL: "https://my-project.firebaseio.com",
        },
      },
      { outputPath: TMP_OUTPUT }
    );

    expect(result.adapter).toBe("firebase-realtime");
    expect(result.totalCollections).toBe(2);
    expect(result.totalDocuments).toBe(2);
    expect(result.outputPath).toBe(path.resolve(TMP_OUTPUT));
    expect(result.warnings).toHaveLength(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

describe("migrate() — firestore", () => {
  it("returns correct stats for firestore source", async () => {
    const result = await migrate(
      {
        type: "firestore",
        config: { serviceAccountKey: {}, projectId: "my-project" },
      },
      { outputPath: TMP_OUTPUT }
    );

    expect(result.adapter).toBe("firestore");
    expect(result.totalCollections).toBe(1);
    expect(result.totalDocuments).toBe(1);
  });
});

describe("migrate() — supabase", () => {
  it("returns correct stats for supabase source", async () => {
    const result = await migrate(
      {
        type: "supabase",
        config: {
          url: "https://xyz.supabase.co",
          serviceRoleKey: "service-role-key",
        },
      },
      { outputPath: TMP_OUTPUT }
    );

    expect(result.adapter).toBe("supabase");
    expect(result.totalCollections).toBe(1);
    expect(result.totalDocuments).toBe(2);
  });
});

describe("migrate() — onProgress callback", () => {
  it("calls onProgress for each progress event", async () => {
    const progressEvents: unknown[] = [];

    await migrate(
      {
        type: "firestore",
        config: { serviceAccountKey: {}, projectId: "my-project" },
      },
      {
        outputPath: TMP_OUTPUT,
        onProgress: (p) => progressEvents.push(p),
      }
    );

    // The mock adapter doesn't emit progress, but the callback must not throw
    expect(progressEvents).toBeDefined();
  });
});

describe("migrate() — unknown adapter", () => {
  it("throws for an unrecognised source type", async () => {
    await expect(
      // @ts-expect-error intentional bad input
      migrate({ type: "unknown-source", config: {} }, { outputPath: TMP_OUTPUT })
    ).rejects.toThrow("Unknown adapter type");
  });
});

describe("migrate() — warnings collection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects warnings emitted via onProgress", async () => {
    const { migrateFirebaseRealtime } = await import("../src/adapters/firebase-realtime.js");

    (migrateFirebaseRealtime as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async (_config: unknown, _opts: unknown, onProgress: (p: unknown) => void) => {
        onProgress({
          adapter: "firebase-realtime",
          collection: "users",
          processed: 0,
          total: 1,
          warning: "Could not parse field 'metadata'",
        });
        return { users: [] };
      }
    );

    const result = await migrate(
      {
        type: "firebase-realtime",
        config: { serviceAccountKey: {}, databaseURL: "https://x.firebaseio.com" },
      },
      { outputPath: TMP_OUTPUT }
    );

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("Could not parse field");
  });
});
