import { describe, it, expect } from "vitest";
import {
  flattenFirebaseNode,
  convertFirestoreValue,
  mapSupabaseType,
  createInitialVectorClock,
  createZerithDocument,
} from "../src/converters/schema.js";

// ── flattenFirebaseNode ───────────────────────────────────────────────────────

describe("flattenFirebaseNode", () => {
  it("returns { value } for primitive input", () => {
    expect(flattenFirebaseNode("hello")).toEqual({ value: "hello" });
    expect(flattenFirebaseNode(42)).toEqual({ value: 42 });
    expect(flattenFirebaseNode(null)).toEqual({ value: null });
  });

  it("passes through a flat object unchanged", () => {
    const input = { name: "Alice", age: 30 };
    const result = flattenFirebaseNode(input);
    expect(result).toEqual({ name: "Alice", age: 30 });
  });

  it("preserves nested objects as-is (one-level flatten)", () => {
    const input = { profile: { bio: "Dev" }, score: 99 };
    const result = flattenFirebaseNode(input);
    expect(result.profile).toEqual({ bio: "Dev" });
    expect(result.score).toBe(99);
  });

  it("preserves arrays", () => {
    const input = { tags: ["a", "b", "c"] };
    const result = flattenFirebaseNode(input);
    expect(result.tags).toEqual(["a", "b", "c"]);
  });
});

// ── convertFirestoreValue ─────────────────────────────────────────────────────

describe("convertFirestoreValue", () => {
  it("returns null for null/undefined", () => {
    expect(convertFirestoreValue(null)).toBeNull();
    expect(convertFirestoreValue(undefined)).toBeNull();
  });

  it("converts Firestore-like Timestamp objects to ISO strings", () => {
    const fakeTimestamp = {
      seconds: 1_700_000_000,
      nanoseconds: 0,
      toDate: () => new Date(1_700_000_000_000),
    };
    const result = convertFirestoreValue(fakeTimestamp);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("converts Firestore-like GeoPoint to {lat, lng}", () => {
    const fakeGeoPoint = { latitude: 12.34, longitude: 56.78 };
    const result = convertFirestoreValue(fakeGeoPoint);
    expect(result).toEqual({ lat: 12.34, lng: 56.78 });
  });

  it("converts Firestore-like DocumentReference to {_ref: path}", () => {
    const fakeRef = { id: "abc", path: "users/abc", parent: {} };
    const result = convertFirestoreValue(fakeRef);
    expect(result).toEqual({ _ref: "users/abc" });
  });

  it("converts Firestore-like Bytes to {_bytes: base64}", () => {
    const fakeBytes = { toBase64: () => "aGVsbG8=" };
    const result = convertFirestoreValue(fakeBytes);
    expect(result).toEqual({ _bytes: "aGVsbG8=" });
  });

  it("passes through primitive values", () => {
    expect(convertFirestoreValue("hello")).toBe("hello");
    expect(convertFirestoreValue(42)).toBe(42);
    expect(convertFirestoreValue(true)).toBe(true);
  });

  it("recursively converts array elements", () => {
    const fakeTs = {
      seconds: 0,
      nanoseconds: 0,
      toDate: () => new Date(0),
    };
    const result = convertFirestoreValue([fakeTs, "plain"]) as unknown[];
    expect(typeof result[0]).toBe("string");
    expect(result[1]).toBe("plain");
  });

  it("recursively converts nested objects", () => {
    const fakeGeo = { latitude: 1.0, longitude: 2.0 };
    const result = convertFirestoreValue({ location: fakeGeo }) as Record<string, unknown>;
    expect(result.location).toEqual({ lat: 1.0, lng: 2.0 });
  });
});

// ── mapSupabaseType ───────────────────────────────────────────────────────────

describe("mapSupabaseType", () => {
  it("returns null for null values", () => {
    expect(mapSupabaseType("name", null, new Set())).toBeNull();
  });

  it("converts foreign key columns to _ref objects", () => {
    const fk = new Set(["user_id"]);
    const result = mapSupabaseType("user_id", 42, fk) as Record<string, unknown>;
    expect(result._ref).toBe("42");
    expect(result._refCollection).toBe("users");
  });

  it("converts Postgres timestamp strings to ISO format", () => {
    const ts = "2024-01-15 10:30:00";
    const result = mapSupabaseType("created_at", ts, new Set()) as string;
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("passes through regular string values", () => {
    const result = mapSupabaseType("name", "Alice", new Set());
    expect(result).toBe("Alice");
  });

  it("passes through arrays", () => {
    const arr = [1, 2, 3];
    const result = mapSupabaseType("tags", arr, new Set());
    expect(result).toEqual([1, 2, 3]);
  });

  it("passes through plain objects (JSONB)", () => {
    const obj = { nested: true };
    const result = mapSupabaseType("metadata", obj, new Set());
    expect(result).toEqual({ nested: true });
  });
});

// ── createInitialVectorClock ──────────────────────────────────────────────────

describe("createInitialVectorClock", () => {
  it("creates a clock with the given nodeId at time 1", () => {
    const clock = createInitialVectorClock("node-abc");
    expect(clock).toEqual({ "node-abc": 1 });
  });
});

// ── createZerithDocument ──────────────────────────────────────────────────────

describe("createZerithDocument", () => {
  const baseOpts = {
    collection: "users",
    data: { name: "Alice", age: 30 },
    originalId: "firebase-123",
    adapterType: "firestore" as const,
    nodeId: "migration-node-1",
  };

  it("produces a document with all required ZerithDB fields", () => {
    const doc = createZerithDocument(baseOpts);
    expect(doc._id).toBeTruthy();
    expect(doc._collection).toBe("users");
    expect(doc._vectorClock).toEqual({ "migration-node-1": 1 });
    expect(doc._migratedFrom.type).toBe("firestore");
    expect(doc._migratedFrom.originalId).toBe("firebase-123");
    expect(doc.data).toEqual({ name: "Alice", age: 30 });
  });

  it("uses the provided id if given", () => {
    const doc = createZerithDocument({ ...baseOpts, id: "custom-id" });
    expect(doc._id).toBe("custom-id");
  });

  it("uses the provided createdAt / updatedAt", () => {
    const created = new Date("2023-01-01T00:00:00Z");
    const updated = new Date("2024-06-15T12:00:00Z");
    const doc = createZerithDocument({ ...baseOpts, createdAt: created, updatedAt: updated });
    expect(doc._createdAt).toBe("2023-01-01T00:00:00.000Z");
    expect(doc._updatedAt).toBe("2024-06-15T12:00:00.000Z");
  });

  it("sets _createdAt and _updatedAt to now when not provided", () => {
    const before = Date.now();
    const doc = createZerithDocument(baseOpts);
    const after = Date.now();
    const docTime = new Date(doc._createdAt).getTime();
    expect(docTime).toBeGreaterThanOrEqual(before);
    expect(docTime).toBeLessThanOrEqual(after);
  });

  it("includes migratedAt in the migration source", () => {
    const doc = createZerithDocument(baseOpts);
    expect(doc._migratedFrom.migratedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
