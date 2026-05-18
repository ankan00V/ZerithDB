// ─────────────────────────────────────────────────────────────────────────────
// Firebase Realtime Database Adapter
// Connects to Firebase RTDB, reads the full tree, and yields ZerithDocuments.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { ServiceAccount } from "firebase-admin/app";
import { flattenFirebaseNode, createZerithDocument } from "../converters/schema.js";
import type {
  FirebaseRealtimeConfig,
  AdapterOptions,
  MigrationProgress,
  ZerithDocument,
} from "../types.js";

export async function migrateFirebaseRealtime(
  config: FirebaseRealtimeConfig,
  options: AdapterOptions,
  onProgress: (p: MigrationProgress) => void
): Promise<Record<string, ZerithDocument[]>> {
  const nodeId = options.nodeId ?? `migration-${uuidv4()}`;
  const batchSize = options.batchSize ?? 500;

  // Lazy-load firebase-admin to keep the package optional at runtime
  const admin = await import("firebase-admin").catch(() => {
    throw new Error("firebase-admin is not installed. Run: pnpm add firebase-admin");
  });

  // Initialise a temporary app so we don't conflict with existing Firebase apps
  const appName = `zerithdb-migrate-${Date.now()}`;
  const app = admin.default.initializeApp(
    {
      credential: admin.default.credential.cert(config.serviceAccountKey as ServiceAccount),
      databaseURL: config.databaseURL,
    },
    appName
  );

  const db = admin.default.database(app);

  try {
    // Read top-level keys first (shallow), then fetch each collection separately.
    // This avoids loading the entire database into memory at once.
    const rootSnap = await db.ref("/").get();
    const shallowRoot = rootSnap.val() as Record<string, unknown> | null;

    if (!shallowRoot) {
      return {};
    }

    const result: Record<string, ZerithDocument[]> = {};
    const topLevelKeys = Object.keys(shallowRoot);

    // Each top-level key is treated as a "collection"
    const collections = filterCollections(topLevelKeys, options);

    for (const collection of collections) {
      const collectionSnap = await db.ref(collection).get();
      const collectionData = collectionSnap.val() as Record<string, unknown> | null;

      if (!collectionData) continue;

      const entries = Object.entries(collectionData);
      const total = entries.length;
      const docs: ZerithDocument[] = [];
      let processed = 0;

      onProgress({ adapter: "firebase-realtime", collection, processed: 0, total });

      for (let i = 0; i < entries.length; i += batchSize) {
        const batch = entries.slice(i, i + batchSize);

        for (const [originalId, nodeData] of batch) {
          try {
            const flat = flattenFirebaseNode(nodeData);

            // Extract known timestamp fields if present
            const createdAt = extractDate(flat["createdAt"] ?? flat["created_at"]);
            const updatedAt = extractDate(
              flat["updatedAt"] ?? flat["updated_at"] ?? flat["lastModified"]
            );

            // Remove timestamp fields from data payload — they become metadata
            delete flat["createdAt"];
            delete flat["created_at"];
            delete flat["updatedAt"];
            delete flat["updated_at"];
            delete flat["lastModified"];

            const doc = createZerithDocument({
              collection,
              data: flat,
              originalId,
              adapterType: "firebase-realtime",
              nodeId,
              ...(createdAt !== undefined ? { createdAt } : {}),
              ...(updatedAt !== undefined ? { updatedAt } : {}),
            });

            docs.push(doc);
          } catch (err) {
            onProgress({
              adapter: "firebase-realtime",
              collection,
              processed,
              total,
              warning: `Failed to convert document "${originalId}": ${String(err)}`,
            });
          }

          processed++;
        }

        onProgress({ adapter: "firebase-realtime", collection, processed, total });
      }

      result[collection] = docs;
    }

    return result;
  } finally {
    await app.delete();
  }
}

function filterCollections(keys: string[], opts: AdapterOptions): string[] {
  let result = keys;
  if (opts.include && opts.include.length > 0) {
    result = result.filter((k) => opts.include!.includes(k));
  }
  if (opts.exclude && opts.exclude.length > 0) {
    result = result.filter((k) => !opts.exclude!.includes(k));
  }
  return result;
}

function extractDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === "number") return new Date(val);
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}
