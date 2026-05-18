// ─────────────────────────────────────────────────────────────────────────────
// Firestore Adapter
// Reads all collections from a Firestore project and converts them to
// ZerithDB documents, handling all native Firestore types.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import type { ServiceAccount } from "firebase-admin/app";
import { convertFirestoreValue, createZerithDocument } from "../converters/schema.js";
import type {
  FirestoreConfig,
  AdapterOptions,
  MigrationProgress,
  ZerithDocument,
} from "../types.js";

export async function migrateFirestore(
  config: FirestoreConfig,
  options: AdapterOptions,
  onProgress: (p: MigrationProgress) => void
): Promise<Record<string, ZerithDocument[]>> {
  const nodeId = options.nodeId ?? `migration-${uuidv4()}`;
  const batchSize = options.batchSize ?? 500;

  const admin = await import("firebase-admin").catch(() => {
    throw new Error("firebase-admin is not installed. Run: pnpm add firebase-admin");
  });

  const appName = `zerithdb-migrate-firestore-${Date.now()}`;
  const app = admin.default.initializeApp(
    {
      credential: admin.default.credential.cert(config.serviceAccountKey as ServiceAccount),
      projectId: config.projectId,
    },
    appName
  );

  const firestore = admin.default.firestore(app);

  try {
    // List all top-level collections
    const collectionRefs = await firestore.listCollections();
    const allCollectionIds = collectionRefs.map((r) => r.id);
    const collections = filterCollections(allCollectionIds, options);

    const result: Record<string, ZerithDocument[]> = {};

    for (const collectionId of collections) {
      const collectionRef = firestore.collection(collectionId);

      // Count docs for accurate progress reporting
      const countSnap = await collectionRef.count().get();
      const total = countSnap.data().count;

      const docs: ZerithDocument[] = [];
      let processed = 0;
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;

      onProgress({ adapter: "firestore", collection: collectionId, processed: 0, total });

      // Paginate through the collection in batches
      for (;;) {
        let query = collectionRef.limit(batchSize);
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snap = await query.get();
        if (snap.empty) break;

        for (const docSnap of snap.docs) {
          try {
            const rawData = docSnap.data();
            const converted: Record<string, unknown> = {};

            for (const [field, value] of Object.entries(rawData)) {
              converted[field] = convertFirestoreValue(value);
            }

            // Extract known timestamp metadata
            const createdAt = extractFirestoreDate(rawData["createdAt"] ?? rawData["created_at"]);
            const updatedAt = extractFirestoreDate(
              rawData["updatedAt"] ?? rawData["updated_at"] ?? rawData["lastModified"]
            );

            // Strip metadata fields from the data payload
            delete converted["createdAt"];
            delete converted["created_at"];
            delete converted["updatedAt"];
            delete converted["updated_at"];
            delete converted["lastModified"];

            const doc = createZerithDocument({
              collection: collectionId,
              data: rawData,
              originalId: docSnap.id,
              adapterType: "firestore",
              nodeId,
              ...(createdAt !== undefined ? { createdAt } : {}),
              ...(updatedAt !== undefined ? { updatedAt } : {}),
            });

            docs.push(doc);
          } catch (err) {
            onProgress({
              adapter: "firestore",
              collection: collectionId,
              processed,
              total,
              warning: `Failed to convert document "${docSnap.id}": ${String(err)}`,
            });
          }

          processed++;
        }

        lastDoc = snap.docs[snap.docs.length - 1];
        onProgress({ adapter: "firestore", collection: collectionId, processed, total });

        if (snap.size < batchSize) break;
      }

      result[collectionId] = docs;
    }

    return result;
  } finally {
    await app.delete();
  }
}

function filterCollections(ids: string[], opts: AdapterOptions): string[] {
  let result = ids;
  if (opts.include && opts.include.length > 0) {
    result = result.filter((id) => opts.include!.includes(id));
  }
  if (opts.exclude && opts.exclude.length > 0) {
    result = result.filter((id) => !opts.exclude!.includes(id));
  }
  return result;
}

function extractFirestoreDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  // Firestore Timestamp
  if (
    typeof val === "object" &&
    val !== null &&
    typeof (val as Record<string, unknown>).toDate === "function"
  ) {
    return (val as { toDate: () => Date }).toDate();
  }
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}
