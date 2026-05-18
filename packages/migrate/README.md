# `zerithdb-migrate`

CLI and programmatic migrator from **Firebase Realtime DB**, **Firestore**, and **Supabase** to
**ZerithDB** local-first format.

---

## Installation

```bash
pnpm add -D zerithdb-migrate
# or globally
npm install -g zerithdb-migrate
```

---

## CLI Usage

### Migrate from Firebase Realtime Database

```bash
zerithdb-migrate firebase-realtime \
  --service-account ./firebase-service-account.json \
  --database-url https://my-project-default-rtdb.firebaseio.com \
  --output ./zerithdb-export.json
```

### Migrate from Firestore

```bash
zerithdb-migrate firestore \
  --service-account ./firebase-service-account.json \
  --project-id my-firebase-project \
  --output ./zerithdb-export.json
```

### Migrate from Supabase

```bash
zerithdb-migrate supabase \
  --url https://xyzxyz.supabase.co \
  --service-role-key your-service-role-key \
  --output ./zerithdb-export.json
```

### Common Options

| Flag                | Description                                   | Default                               |
| ------------------- | --------------------------------------------- | ------------------------------------- |
| `--output <path>`   | Output file path                              | `./zerithdb-export.json`              |
| `--include <names>` | Comma-separated collections/tables to include | (all)                                 |
| `--exclude <names>` | Comma-separated collections/tables to exclude | (none)                                |
| `--batch-size <n>`  | Paginated read batch size                     | 500 (RTDB/Firestore), 1000 (Supabase) |

---

## Programmatic Usage

```ts
import { migrate } from "zerithdb-migrate";

const result = await migrate(
  {
    type: "supabase",
    config: {
      url: process.env.SUPABASE_URL!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
    },
  },
  {
    outputPath: "./zerithdb-export.json",
    include: ["users", "posts"], // optional: only migrate these tables
    batchSize: 500,
    onProgress: (p) => {
      console.log(`[${p.collection}] ${p.processed}/${p.total}`);
    },
  }
);

console.log(`Migrated ${result.totalDocuments} documents in ${result.durationMs}ms`);
```

---

## Output Format

The migrator writes a single JSON file with this shape:

```jsonc
{
  "version": "1.0",
  "migratedAt": "2026-05-17T18:00:00.000Z",
  "source": "supabase",
  "stats": {
    "totalDocuments": 4200,
    "totalCollections": 8,
    "durationMs": 3412,
  },
  "collections": {
    "users": [
      {
        "_id": "550e8400-e29b-41d4-a716-446655440000",
        "_collection": "users",
        "_createdAt": "2024-01-01T00:00:00.000Z",
        "_updatedAt": "2024-06-01T12:00:00.000Z",
        "_vectorClock": { "migration-abc123": 1 },
        "_migratedFrom": {
          "type": "supabase",
          "originalId": "42",
          "migratedAt": "2026-05-17T18:00:00.000Z",
        },
        "data": {
          "name": "Alice",
          "email": "alice@example.com",
        },
      },
    ],
  },
}
```

### Type Mapping

#### Supabase / PostgreSQL

| Postgres type                        | ZerithDB representation                   |
| ------------------------------------ | ----------------------------------------- |
| `UUID`, `INTEGER`, `TEXT`, `BOOLEAN` | Native JS value                           |
| `TIMESTAMP`, `TIMESTAMPTZ`           | ISO-8601 string                           |
| `JSONB`, `JSON`                      | Nested object (pass-through)              |
| `ARRAY`                              | JavaScript array                          |
| Foreign key column (`*_id`)          | `{ _ref: "42", _refCollection: "users" }` |

#### Firestore

| Firestore type      | ZerithDB representation        |
| ------------------- | ------------------------------ |
| `Timestamp`         | ISO-8601 string                |
| `GeoPoint`          | `{ lat: number, lng: number }` |
| `DocumentReference` | `{ _ref: "collection/docId" }` |
| `Bytes`             | `{ _bytes: "base64string" }`   |
| `Array`, `Map`      | Recursively converted          |

#### Firebase Realtime DB

The full JSON tree is flattened one level. Each top-level key becomes a collection; each child key
becomes a document. Arrays are preserved as-is.

---

## Importing the Export into ZerithDB

After migration, load the export file in your ZerithDB app at startup:

```ts
import { createApp } from "zerithdb-sdk";
import exportData from "./zerithdb-export.json" assert { type: "json" };

const app = createApp({ appId: "my-app" });

// Seed the local IndexedDB with migrated data
for (const [collection, docs] of Object.entries(exportData.collections)) {
  for (const doc of docs) {
    await app.db(collection).insert(doc);
  }
}
```

All documents include proper vector clocks so they are immediately P2P-sync ready.

---

## Architecture Notes

- **Vector clocks** — Every migrated document is assigned an initial vector clock
  `{ "<migrationNodeId>": 1 }`. This marks it as the genesis revision. When peers sync, they treat
  it as the base state and increment from there.

- **Foreign key → document refs** — SQL foreign keys (`user_id → users.id`) become
  `{ _ref, _refCollection }` objects. ZerithDB's query layer can resolve these locally without a
  JOIN.

- **No data loss** — All original field values are preserved. Timestamps and special types are
  serialised to portable representations. The `_migratedFrom` field keeps a full audit trail.

- **Performance** — Reads are paginated in configurable batches. A `cli-progress` multi-bar shows
  real-time progress per collection. Non-fatal errors per document are collected as warnings rather
  than aborting the entire migration.
