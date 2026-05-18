// ─────────────────────────────────────────────────────────────────────────────
// ZerithDB Migration Types
// Shared interfaces used across all adapters and converters.
// ─────────────────────────────────────────────────────────────────────────────

/** A vector clock entry: nodeId → logical timestamp */
export type VectorClock = Record<string, number>;

/** ZerithDB's canonical document format stored in IndexedDB via Dexie */
export interface ZerithDocument {
  /** Unique document ID (UUID v4) */
  _id: string;
  /** The collection / table this doc belongs to */
  _collection: string;
  /** ISO-8601 creation timestamp */
  _createdAt: string;
  /** ISO-8601 last-modified timestamp */
  _updatedAt: string;
  /** Vector clock for CRDT-based P2P conflict resolution */
  _vectorClock: VectorClock;
  /** Migration provenance — which source this record came from */
  _migratedFrom: MigrationSource;
  /** All user-defined fields live here */
  data: Record<string, unknown>;
}

/** Describes where a document originally came from */
export interface MigrationSource {
  type: AdapterType;
  /** Original primary key / document path in the source system */
  originalId: string;
  /** ISO-8601 timestamp of the migration run */
  migratedAt: string;
}

/** Supported source adapters */
export type AdapterType = "firebase-realtime" | "firestore" | "supabase";

/** Options passed to every adapter */
export interface AdapterOptions {
  /** Unique node ID used when seeding the vector clock */
  nodeId?: string;
  /** Optional list of collections / tables to include (omit = all) */
  include?: string[];
  /** Optional list of collections / tables to exclude */
  exclude?: string[];
  /** Batch size for paginated reads (Supabase) */
  batchSize?: number;
}

/** Firebase Realtime DB connection config */
export interface FirebaseRealtimeConfig {
  serviceAccountKey: object;
  databaseURL: string;
}

/** Firestore connection config */
export interface FirestoreConfig {
  serviceAccountKey: object;
  projectId: string;
}

/** Supabase connection config */
export interface SupabaseConfig {
  url: string;
  serviceRoleKey: string;
  /** Tables to migrate. If empty all public-schema tables are fetched. */
  tables?: string[];
}

/** Progress update emitted during migration */
export interface MigrationProgress {
  /** Source adapter in use */
  adapter: AdapterType;
  /** Current collection / table being processed */
  collection: string;
  /** Documents processed so far in this collection */
  processed: number;
  /** Total documents in this collection (−1 if unknown) */
  total: number;
  /** Any non-fatal warning encountered */
  warning?: string;
}

/** Final result of a complete migration run */
export interface MigrationResult {
  adapter: AdapterType;
  /** Total documents successfully converted */
  totalDocuments: number;
  /** Total collections / tables migrated */
  totalCollections: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Any warnings collected during the run */
  warnings: string[];
  /** Path to the output file */
  outputPath: string;
}

/** Top-level output file written to disk */
export interface MigrationOutput {
  /** Schema version for forward-compatibility */
  version: "1.0";
  migratedAt: string;
  source: AdapterType;
  stats: {
    totalDocuments: number;
    totalCollections: number;
    durationMs: number;
  };
  /** Map of collection name → array of ZerithDocuments */
  collections: Record<string, ZerithDocument[]>;
}
