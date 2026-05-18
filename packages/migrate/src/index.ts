// Public API for zerithdb-migrate
export { migrate } from "./migrator.js";
export type { SourceConfig, MigrateOptions } from "./migrator.js";
export type {
  ZerithDocument,
  MigrationResult,
  MigrationOutput,
  MigrationProgress,
  AdapterType,
  VectorClock,
  FirebaseRealtimeConfig,
  FirestoreConfig,
  SupabaseConfig,
  AdapterOptions,
} from "./types.js";
