// ─────────────────────────────────────────────────────────────────────────────
// Migrator Core
// Orchestrates adapter selection, progress reporting, and output writing.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFile, ensureDir } from "fs-extra";
import { resolve, dirname } from "path";
import { v4 as uuidv4 } from "uuid";

import { migrateFirebaseRealtime } from "./adapters/firebase-realtime.js";
import { migrateFirestore } from "./adapters/firestore.js";
import { migrateSupabase } from "./adapters/supabase.js";

import type {
  AdapterType,
  AdapterOptions,
  FirebaseRealtimeConfig,
  FirestoreConfig,
  SupabaseConfig,
  MigrationProgress,
  MigrationResult,
  MigrationOutput,
  ZerithDocument,
} from "./types.js";

export type SourceConfig =
  | { type: "firebase-realtime"; config: FirebaseRealtimeConfig }
  | { type: "firestore"; config: FirestoreConfig }
  | { type: "supabase"; config: SupabaseConfig };

export interface MigrateOptions extends AdapterOptions {
  /** Output file path. Defaults to ./zerithdb-export.json */
  outputPath?: string;
  /** Called on each progress update */
  onProgress?: (p: MigrationProgress) => void;
}

/**
 * Main entry point for programmatic use.
 *
 * @example
 * ```ts
 * import { migrate } from "zerithdb-migrate";
 *
 * const result = await migrate(
 *   { type: "supabase", config: { url, serviceRoleKey } },
 *   { outputPath: "./export.json", onProgress: console.log }
 * );
 * console.log(`Migrated ${result.totalDocuments} documents`);
 * ```
 */
export async function migrate(
  source: SourceConfig,
  options: MigrateOptions = {}
): Promise<MigrationResult> {
  const startTime = Date.now();
  const warnings: string[] = [];
  const outputPath = resolve(options.outputPath ?? "./zerithdb-export.json");

  const nodeId = options.nodeId ?? `migration-${uuidv4()}`;
  const adapterOptions: AdapterOptions = {
    nodeId,
    ...(options.include !== undefined ? { include: options.include } : {}),
    ...(options.exclude !== undefined ? { exclude: options.exclude } : {}),
    ...(options.batchSize !== undefined ? { batchSize: options.batchSize } : {}),
  };

  const onProgress = (p: MigrationProgress) => {
    if (p.warning) warnings.push(`[${p.collection}] ${p.warning}`);
    options.onProgress?.(p);
  };

  // ── Run the selected adapter ──────────────────────────────────────────────

  let collections: Record<string, ZerithDocument[]>;

  switch (source.type) {
    case "firebase-realtime":
      collections = await migrateFirebaseRealtime(source.config, adapterOptions, onProgress);
      break;

    case "firestore":
      collections = await migrateFirestore(source.config, adapterOptions, onProgress);
      break;

    case "supabase":
      collections = await migrateSupabase(source.config, adapterOptions, onProgress);
      break;

    default:
      throw new Error(`Unknown adapter type: ${(source as SourceConfig).type}`);
  }

  // ── Compute stats ─────────────────────────────────────────────────────────

  const totalCollections = Object.keys(collections).length;
  const totalDocuments = Object.values(collections).reduce((sum, docs) => sum + docs.length, 0);
  const durationMs = Date.now() - startTime;

  // ── Write output file ─────────────────────────────────────────────────────

  await ensureDir(dirname(outputPath));

  const output: MigrationOutput = {
    version: "1.0",
    migratedAt: new Date().toISOString(),
    source: source.type as AdapterType,
    stats: { totalDocuments, totalCollections, durationMs },
    collections,
  };

  await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");

  return {
    adapter: source.type as AdapterType,
    totalDocuments,
    totalCollections,
    durationMs,
    warnings,
    outputPath,
  };
}
