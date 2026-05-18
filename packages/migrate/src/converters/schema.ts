// ─────────────────────────────────────────────────────────────────────────────
// Schema Converter
// Handles datatype mapping from Firebase / Supabase → ZerithDB document format.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { ZerithDocument, VectorClock, AdapterType, MigrationSource } from "../types.js";

// ── Datatype mappings ─────────────────────────────────────────────────────────

/**
 * Supabase / PostgreSQL → ZerithDB type mapping.
 * SQL relation columns (foreign keys) become `_ref` objects so the
 * local-first layer can resolve them via P2P sync without a central DB.
 */
export function mapSupabaseType(
  columnName: string,
  value: unknown,
  foreignKeys: Set<string>
): unknown {
  if (value === null || value === undefined) return null;

  // Foreign key columns become document references
  if (foreignKeys.has(columnName)) {
    return { _ref: String(value), _refCollection: columnName.replace(/_id$/, "s") };
  }

  // Postgres arrays → JS arrays
  if (Array.isArray(value)) return value;

  // Postgres JSONB / JSON → pass-through (already parsed by supabase-js)
  if (typeof value === "object") return value;

  // Postgres timestamps → ISO-8601 strings
  // Normalise to UTC explicitly: append Z if no timezone offset present
  // so JS Date does not silently shift to local timezone.
  if (typeof value === "string" && isPostgresTimestamp(value)) {
    const hasOffset = /([+-]\d{2}:?\d{2}|Z)$/.test(value);
    const utcString = hasOffset ? value : value.replace(" ", "T") + "Z";
    return new Date(utcString).toISOString();
  }

  // Booleans, numbers, strings — pass through
  return value;
}

/**
 * Firebase Realtime DB stores everything as a JSON tree.
 * Nested objects become embedded sub-documents; arrays normalise to objects.
 */
export function flattenFirebaseNode(node: unknown): Record<string, unknown> {
  if (node === null || typeof node !== "object") {
    return { value: node };
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(node as Record<string, unknown>)) {
    if (!Array.isArray(val) && val !== null && typeof val === "object") {
      // Firebase stores arrays as numeric-key objects e.g. {"0": "a", "1": "b"}.
      // Detect and convert them back to real JS arrays.
      const entries = Object.entries(val as Record<string, unknown>);
      const isFirebaseArray =
        entries.length > 0 &&
        entries.every(([k]) => /^\d+$/.test(k)) &&
        entries.map(([k]) => Number(k)).every((n, i) => n === i);
      if (isFirebaseArray) {
        result[key] = entries.sort(([a], [b]) => Number(a) - Number(b)).map(([, v]) => v);
      } else {
        result[key] = val;
      }
    } else {
      result[key] = val;
    }
  }
  return result;
}

/**
 * Firestore documents can contain Timestamps, GeoPoints, References, and Bytes.
 * This converter serialises them to plain JS values.
 */
export function convertFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return null;

  // Firestore Timestamp → ISO-8601 string
  if (isFirestoreTimestamp(value)) {
    const ts = value as { toDate: () => Date };
    return ts.toDate().toISOString();
  }

  // Firestore GeoPoint → {lat, lng}
  if (isFirestoreGeoPoint(value)) {
    const gp = value as { latitude: number; longitude: number };
    return { lat: gp.latitude, lng: gp.longitude };
  }

  // Firestore DocumentReference → {_ref: path}
  if (isFirestoreDocumentReference(value)) {
    const ref = value as { path: string };
    return { _ref: ref.path };
  }

  // Firestore Bytes → base64 string
  if (isFirestoreBytes(value)) {
    const bytes = value as { toBase64: () => string };
    return { _bytes: bytes.toBase64() };
  }

  if (Array.isArray(value)) {
    return value.map(convertFirestoreValue);
  }

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = convertFirestoreValue(v);
    }
    return result;
  }

  return value;
}

// ── Vector clock helpers ──────────────────────────────────────────────────────

/**
 * Generates the initial vector clock for a migrated document.
 * We seed it with the migration node ID at logical time 1, indicating this
 * is the "genesis" version that all peers will start from.
 */
export function createInitialVectorClock(nodeId: string): VectorClock {
  return { [nodeId]: 1 };
}

// ── Document factory ──────────────────────────────────────────────────────────

export interface CreateDocumentOptions {
  id?: string;
  collection: string;
  data: Record<string, unknown>;
  originalId: string;
  adapterType: AdapterType;
  nodeId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Wraps any plain data object into a fully-formed ZerithDocument
 * with all required metadata fields populated.
 */
export function createZerithDocument(opts: CreateDocumentOptions): ZerithDocument {
  const now = new Date().toISOString();
  const migratedAt = now;

  const source: MigrationSource = {
    type: opts.adapterType,
    originalId: opts.originalId,
    migratedAt,
  };

  const vectorClock = createInitialVectorClock(opts.nodeId);

  return {
    _id: opts.id ?? uuidv4(),
    _collection: opts.collection,
    _createdAt: opts.createdAt?.toISOString() ?? now,
    _updatedAt: opts.updatedAt?.toISOString() ?? now,
    _vectorClock: vectorClock,
    _migratedFrom: source,
    data: opts.data,
  };
}

// ── Type guards ───────────────────────────────────────────────────────────────

function isFirestoreTimestamp(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as Record<string, unknown>).toDate === "function" &&
    typeof (val as Record<string, unknown>).seconds === "number"
  );
}

function isFirestoreGeoPoint(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as Record<string, unknown>).latitude === "number" &&
    typeof (val as Record<string, unknown>).longitude === "number"
  );
}

function isFirestoreDocumentReference(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as Record<string, unknown>).path === "string" &&
    typeof (val as Record<string, unknown>).id === "string" &&
    typeof (val as Record<string, unknown>).parent === "object"
  );
}

function isFirestoreBytes(val: unknown): boolean {
  return (
    typeof val === "object" &&
    val !== null &&
    typeof (val as Record<string, unknown>).toBase64 === "function"
  );
}

function isPostgresTimestamp(val: string): boolean {
  // Matches common Postgres timestamp formats
  return /^\d{4}-\d{2}-\d{2}(T|\s)\d{2}:\d{2}:\d{2}/.test(val);
}
