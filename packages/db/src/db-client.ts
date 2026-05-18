import Dexie, { type Table, liveQuery } from "dexie";
import { v7 as uuidv7 } from "uuid";
import type {
  ZerithDBConfig,
  Document,
  QueryFilter,
  QueryOptions,
  InsertResult,
  UpdateSpec,
} from "zerithdb-core";
import { ZerithDBError, ErrorCode } from "zerithdb-core";
import { wrapIDBOperation } from "./internal/wrap-idb-operation.js";
import type { BackupExportOptions, BackupSnapshot } from "./backup.js";
import { GraphClient } from "./graph-client.js";
import type { GraphNode, GraphEdge } from "zerithdb-core";
import { generateKeyBetween, rebalanceKeys } from "zerithdb-utils";
/**
 * A handle to a single named collection within the ZerithDB local database.
 * All operations are async and backed by IndexedDB.
 */
export class CollectionClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly table: Table<Document<T>>,
    private readonly collectionName: string,
    private readonly auth?: any
  ) {}

  private async checkBiometric(operationDescription: string): Promise<void> {
    if (this.auth?.biometric?.isBiometricRequiredForDB()) {
      const authorized = await this.auth.biometric.promptBiometric(
        `Authorize sensitive database operation: ${operationDescription} in collection "${this.collectionName}"`
      );
      if (!authorized) {
        throw new ZerithDBError(
          ErrorCode.AUTH_SIGN_FAILED,
          "Database operation cancelled or biometric authentication failed."
        );
      }
    }
  }

  /**
   * Subscribe to live changes in the collection.
   * Uses Dexie's liveQuery to reactively re-invoke the callback whenever
   * matching documents are inserted, updated, or deleted in IndexedDB.
   *
   * Fix (BUG-02): Previously the filter was hardcoded to `{}` (match all),
   * meaning every subscriber always received the entire collection regardless
   * of what they wanted to observe. The filter is now passed through to
   * `find()` so only matching documents are streamed to the callback.
   *
   * **Important:** The filter is evaluated *inside* the liveQuery closure so
   * Dexie can correctly track which IndexedDB reads to watch for reactivity.
   * Moving it outside the closure would break live updates.
   *
   * @param callback - Called with the current matching documents on every change
   * @param filter   - Optional MongoDB-style filter (same as `find(filter)`).
   *                   Defaults to `{}` which matches all documents.
   *                   Existing callers that omit the filter are unaffected.
   * @returns An unsubscribe function — call it to stop the subscription
   *
   * @example
   * ```typescript
   * // Subscribe to ALL documents (existing behaviour — unchanged)
   * const unsub = todos.subscribe((docs) => console.log(docs));
   *
   * // Subscribe to only undone tasks (new capability)
   * const unsub = todos.subscribe(
   *   (docs) => console.log("Undone:", docs),
   *   { done: false }
   * );
   *
   * // Subscribe with operators
   * const unsub = todos.subscribe(
   *   (docs) => console.log("High priority:", docs),
   *   { priority: { $gte: 3 } }
   * );
   *
   * unsub(); // stop listening
   * ```
   */
  subscribe(
    callback: (documents: Document<T>[]) => void,
    filter: QueryFilter<T> = {}
  ): () => void {
    // The filter reference is captured inside the liveQuery closure.
    // This is required — Dexie tracks all IDB reads that happen INSIDE the
    // closure to build its reactive dependency graph. If find() were called
    // outside, Dexie would not know which table changes to watch.
    const observable = liveQuery(() => this.find(filter));
    const subscription = observable.subscribe({
      next: (docs) => callback(docs),
      error: (err) =>
        console.error(
          `[ZerithDB] Error in subscription to collection "${this.collectionName}":`,
          err
        ),
    });
    return () => subscription.unsubscribe();
  }

  /**
   * Insert a new document into the collection.
   * Automatically assigns `_id`, `_createdAt`, and `_updatedAt`.
   */
  async insert(document: T): Promise<InsertResult> {
    if (document === null || document === undefined) {
      throw new ZerithDBError(ErrorCode.DB_WRITE_FAILED, "Document cannot be null or undefined");
    }
    await this.checkBiometric("Insert Document");
    const now = Date.now();
    const id = uuidv7();
    const doc: Document<T> = {
      ...document,
      _id: id,
      _createdAt: now,
      _updatedAt: now,
    };

    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to insert into collection "${this.collectionName}"`,
      async () => {
        await this.table.add(doc);
        return { id };
      }
    );
  }

  /**
   * Insert multiple documents in a single atomic operation.
   */
  async insertMany(documents: T[]): Promise<InsertResult[]> {
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new ZerithDBError(ErrorCode.DB_WRITE_FAILED, "Documents must be a non-empty array");
    }
    await this.checkBiometric("Bulk Insert Documents");
    for (const doc of documents) {
      if (doc === null || doc === undefined) {
        throw new ZerithDBError(
          ErrorCode.DB_WRITE_FAILED,
          "Documents array cannot contain null or undefined"
        );
      }
    }
    const now = Date.now();
    const docs = documents.map((doc) => ({
      ...doc,
      _id: uuidv7(),
      _createdAt: now,
      _updatedAt: now,
    })) as Document<T>[];

    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to bulk insert into collection "${this.collectionName}"`,
      async () => {
        await this.table.bulkAdd(docs);
        return docs.map((d) => ({ id: d._id }));
      }
    );
  }

  /**
   * Find documents matching a filter.
   * All filter fields are ANDed together.
   *
   * @example
   * ```typescript
   * const active = await todos.find({ done: false });
   * const high = await todos.find({ priority: { $gte: 3 } });
   * ```
   */
  async find(filter: QueryFilter<T> = {}, options: QueryOptions<T> = {}): Promise<Document<T>[]> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to query collection "${this.collectionName}"`,
      async () => {
        const compiledFilter = this.precompileRegexes(filter);
        const results: Document<T>[] = [];

        await this.table.each((doc) => {
          if (this.matchesFilter(doc, compiledFilter)) {
            results.push(doc);
          }
        });

        if (options.sort) {
          const { field, order = "asc" } = options.sort;

          results.sort((a, b) => {
            const aValue = a[field];
            const bValue = b[field];

            if (aValue === bValue) return 0;

            if (aValue == null) return 1;
            if (bValue == null) return -1;

            const comparison = String(aValue).localeCompare(String(bValue), undefined, {
              numeric: true,
              sensitivity: "base",
            });

            return order === "desc" ? -comparison : comparison;
          });
        }

        const skip = options.skip ?? options.offset ?? 0;
        const limit = options.limit ?? Number.POSITIVE_INFINITY;

        return results.slice(skip, skip + limit);
      }
    );
  }

  /**
   * Find a single document by its `_id`.
   */
  async findById(id: string): Promise<Document<T> | undefined> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get document "${id}" from "${this.collectionName}"`,
      () => this.table.get(id)
    );
  }

  /**
   * Update documents matching a filter.
   * Returns the number of updated documents.
   */
  async update(filter: QueryFilter<T>, spec: UpdateSpec<T>): Promise<number> {
    if (
      !spec ||
      Object.keys(spec).length === 0 ||
      ((!spec.$set || Object.keys(spec.$set).length === 0) &&
        (!spec.$unset || Object.keys(spec.$unset).length === 0))
    ) {
      throw new ZerithDBError(
        ErrorCode.DB_WRITE_FAILED,
        "Update spec cannot be empty. Must provide non-empty $set or $unset."
      );
    }
    await this.checkBiometric("Update Documents");
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to update documents in "${this.collectionName}"`,
      async () => {
        const matches = await this.find(filter);
        const now = Date.now();
        await this.table.bulkPut(matches.map((doc) => this.applyUpdateSpec(doc, spec, now)));
        return matches.length;
      }
    );
  }

  /**
   * Delete documents matching a filter.
   * Returns the number of deleted documents.
   */
  async delete(filter: QueryFilter<T>): Promise<number> {
    await this.checkBiometric("Delete Documents");
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to delete documents from "${this.collectionName}"`,
      async () => {
        const matches = await this.find(filter);
        await this.table.bulkDelete(matches.map((d) => d._id));
        return matches.length;
      }
    );
  }

  /**
   * Delete every document in the collection.
   */
  async clearAll(): Promise<void> {
    await this.checkBiometric("Clear Collection");
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to clear collection "${this.collectionName}"`,
      () => this.table.clear()
    );
  }

  /** Alias for {@link clearAll} */
  async clear(): Promise<void> {
    return this.clearAll();
  }

  /**
   * Count documents matching a filter.
   */
  async count(filter: QueryFilter<T> = {}): Promise<number> {
    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to count documents in "${this.collectionName}"`,
      async () => {
        const compiledFilter = this.precompileRegexes(filter);
        let total = 0;

        await this.table.each((doc) => {
          if (this.matchesFilter(doc, compiledFilter)) {
            total++;
          }
        });

        return total;
      }
    );
  }

  /**
   * Move a document with `docId` strictly between `beforeId` and `afterId` using fractional indexing.
   * Automatically handles start, middle, and end insertion. Updates the document in the local IndexedDB.
   * If the newly generated string index exceeds 50 characters, triggers a background re-balance.
   *
   * @param docId - The ID of the document to move
   * @param beforeId - The ID of the document before the target position (null if moving to start)
   * @param afterId - The ID of the document after the target position (null if moving to end)
   * @param orderKey - The document key where fractional index is stored (defaults to "_order")
   * @returns The generated fractional index string key
   */
  async moveBetween(
    docId: string,
    beforeId: string | null,
    afterId: string | null,
    orderKey = "_order"
  ): Promise<string> {
    if (docId === beforeId || docId === afterId) {
      throw new ZerithDBError(
        ErrorCode.ASSERTION_FAILED,
        "Cannot move a document relative to itself"
      );
    }

    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to move document "${docId}" in collection "${this.collectionName}"`,
      async () => {
        // Fetch target document
        const doc = await this.findById(docId);
        if (!doc) {
          throw new ZerithDBError(
            ErrorCode.DB_WRITE_FAILED,
            `Target document "${docId}" not found in collection "${this.collectionName}"`
          );
        }

        // Fetch boundary documents
        const beforeDoc = beforeId ? await this.findById(beforeId) : null;
        if (beforeId && !beforeDoc) {
          throw new ZerithDBError(
            ErrorCode.DB_WRITE_FAILED,
            `Boundary document (before) "${beforeId}" not found in collection "${this.collectionName}"`
          );
        }

        const afterDoc = afterId ? await this.findById(afterId) : null;
        if (afterId && !afterDoc) {
          throw new ZerithDBError(
            ErrorCode.DB_WRITE_FAILED,
            `Boundary document (after) "${afterId}" not found in collection "${this.collectionName}"`
          );
        }

        // Self-healing: if any document lacks an order key, initialize all order keys in the collection
        const hasMissingOrder =
          !(orderKey in doc) ||
          (beforeDoc && !(orderKey in beforeDoc)) ||
          (afterDoc && !(orderKey in afterDoc));

        let currentBeforeDoc = beforeDoc;
        let currentAfterDoc = afterDoc;

        if (hasMissingOrder) {
          await this.rebalance(orderKey);

          // Re-fetch all documents to get their newly assigned order keys
          const reFetchedDoc = await this.findById(docId);
          if (reFetchedDoc) {
            Object.assign(doc, reFetchedDoc);
          }
          if (beforeId) {
            currentBeforeDoc = (await this.findById(beforeId)) ?? null;
          }
          if (afterId) {
            currentAfterDoc = (await this.findById(afterId)) ?? null;
          }
        }

        // Extract current fractional keys
        const beforeOrder = currentBeforeDoc ? (currentBeforeDoc[orderKey] as string) : null;
        const afterOrder = currentAfterDoc ? (currentAfterDoc[orderKey] as string) : null;

        // Generate deterministic lexical midpoint
        const newOrder = generateKeyBetween(beforeOrder, afterOrder);

        // Save updated document to database
        const now = Date.now();
        await this.table.update(docId, {
          [orderKey]: newOrder,
          _updatedAt: now,
        } as any);

        // Trigger asynchronous background re-balance if string length grows too long
        if (newOrder.length > 50) {
          this.rebalance(orderKey).catch((err) => {
            console.error(`Background rebalance failed for collection "${this.collectionName}":`, err);
          });
        }

        return newOrder;
      }
    );
  }

  /**
   * Rebalances the fractional indexes in the collection to prevent long key strings.
   * Sorts all documents by their current fractional index key and re-allocates evenly spaced keys.
   *
   * @param orderKey - The key where fractional index is stored (defaults to "_order")
   */
  async rebalance(orderKey = "_order"): Promise<void> {
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to rebalance order keys in collection "${this.collectionName}"`,
      async () => {
        const allDocs = await this.table.toArray();

        // Sort documents by current orderKey, falling back to creation time and ID to guarantee deterministic output
        allDocs.sort((a, b) => {
          const valA = (a[orderKey] as string) ?? "";
          const valB = (b[orderKey] as string) ?? "";
          if (valA < valB) return -1;
          if (valA > valB) return 1;

          const timeA = a._createdAt ?? 0;
          const timeB = b._createdAt ?? 0;
          if (timeA !== timeB) return timeA - timeB;

          return a._id.localeCompare(b._id);
        });

        const balancedKeys = rebalanceKeys(allDocs.length);
        const now = Date.now();

        const updates = allDocs.map((doc, idx) => ({
          ...doc,
          [orderKey]: balancedKeys[idx],
          _updatedAt: now,
        }));

        await this.table.bulkPut(updates);
      }
    );
  }

  private applyUpdateSpec(doc: Document<T>, spec: UpdateSpec<T>, updatedAt: number): Document<T> {
    const next = {
      ...doc,
      ...(spec.$set ?? {}),
      _updatedAt: updatedAt,
    } as Record<string, any>;

    for (const key of Object.keys(spec.$unset ?? {})) {
      delete next[key];
    }

    next._id = doc._id;
    next._createdAt = doc._createdAt;

    return next as Document<T>;
  }

  private matchesFilter(doc: Document<T>, filter: QueryFilter<T>): boolean {
    for (const [key, condition] of Object.entries(filter)) {
      const fieldValue = (doc as Record<string, any>)[key];

      if (condition === null || typeof condition !== "object") {
        if (fieldValue !== condition) return false;
        continue;
      }

      // Distinguish operator objects ({ $gt: 3 }) from plain object values ({ key: "v" }).
      // Only treat as operators if at least one key starts with "$".
      const conditions = condition as Record<string, any>;
      const isOperatorObject = Object.keys(conditions).some((k) => k.startsWith("$"));

      if (!isOperatorObject) {
        // Deep equality check for plain object / array values
        if (JSON.stringify(fieldValue) !== JSON.stringify(condition)) return false;
        continue;
      }

      if ("$eq" in conditions && fieldValue !== conditions["$eq"]) return false;
      if ("$ne" in conditions && fieldValue === conditions["$ne"]) return false;
      if ("$gt" in conditions && !((fieldValue as any) > (conditions["$gt"] as never)))
        return false;
      if ("$gte" in conditions && !((fieldValue as any) >= (conditions["$gte"] as never)))
        return false;
      if ("$lt" in conditions && !((fieldValue as any) < (conditions["$lt"] as never)))
        return false;
      if ("$lte" in conditions && !((fieldValue as any) <= (conditions["$lte"] as never)))
        return false;
      if ("$in" in conditions && !(conditions["$in"] as unknown[]).includes(fieldValue))
        return false;
      if ("$nin" in conditions && (conditions["$nin"] as unknown[]).includes(fieldValue))
        return false;
      if ("$exists" in conditions) {
        const exists = key in doc;

        if (conditions.$exists !== exists) {
          return false;
        }
      }
      if ("$regex" in conditions) {
        if (typeof fieldValue !== "string") {
          return false;
        }

        const regex = conditions.$regex;

        if (!(regex instanceof RegExp)) {
          return false;
        }

        regex.lastIndex = 0;

        if (!regex.test(fieldValue)) {
          return false;
        }
      }
    }
    return true;
  }

  private precompileRegexes(filter: QueryFilter<T>): QueryFilter<T> {
    const compiled: Record<string, any> = {};
    for (const [key, condition] of Object.entries(filter)) {
      if (condition !== null && typeof condition === "object") {
        const conditions = { ...condition } as Record<string, any>;
        const isOperatorObject = Object.keys(conditions).some((k) => k.startsWith("$"));
        if (isOperatorObject && "$regex" in conditions) {
          conditions["$regex"] = this.compileRegexCondition(conditions);
        }
        compiled[key] = conditions;
      } else {
        compiled[key] = condition;
      }
    }
    return compiled as QueryFilter<T>;
  }

  private compileRegexCondition(conditions: Record<string, any>): RegExp | null {
    const rawRegex = conditions.$regex;
    const rawFlags =
      typeof conditions.$flags === "string"
        ? conditions.$flags
        : typeof conditions.$options === "string"
          ? conditions.$options
          : undefined;

    try {
      if (rawRegex instanceof RegExp) {
        if (!rawFlags) {
          return rawRegex;
        }

        const mergedFlags = Array.from(new Set((rawRegex.flags + rawFlags).split(""))).join("");
        return new RegExp(rawRegex.source, mergedFlags);
      }

      if (typeof rawRegex === "string") {
        return new RegExp(rawRegex, rawFlags);
      }

      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Internal Dexie subclass that manages dynamic collection creation.
 * Collections are added lazily via schema version upgrades.
 */
class ZerithDBDexie extends Dexie {
  private readonly tableMap = new Map<string, Table>();
  private _currentSchema: Record<string, string> = {};
  private _pendingVersion = 0;

  constructor(appId: string) {
    super(`zerithdb_${appId}`);
  }

  /**
   * Ensure a named collection exists, creating it via a Dexie version
   * upgrade if it has not been registered yet.
   *
   * @param name - The collection name to create or retrieve
   * @returns The Dexie {@link Table} handle for the collection
   */
  ensureCollection(name: string): Table {
    if (!this.tableMap.has(name)) {
      this._currentSchema[name] = "_id, _createdAt, _updatedAt";

      // We must increment the version for every new collection added dynamically
      const nextVersion = Math.max(this.verno, this._pendingVersion) + 1;
      this._pendingVersion = nextVersion;

      if (this.isOpen()) {
        this.close();
      }

      this.version(nextVersion).stores(this._currentSchema);
      this.tableMap.set(name, this.table(name));
    }
    // biome-ignore lint: map guarantees this is defined
    return this.tableMap.get(name)!;
  }

  ensureGraphTables(graphName: string): { nodesTable: Table; edgesTable: Table } {
    const nodesKey = `__graph_nodes_${graphName}`;
    const edgesKey = `__graph_edges_${graphName}`;

    if (!this.tableMap.has(nodesKey) || !this.tableMap.has(edgesKey)) {
      this._currentSchema[nodesKey] = "_id, _createdAt, _updatedAt";
      this._currentSchema[edgesKey] = "_id, from, to, label, _createdAt";

      const nextVersion = Math.max(this.verno, this._pendingVersion) + 1;
      this._pendingVersion = nextVersion;

      if (this.isOpen()) {
        this.close();
      }

      this.version(nextVersion).stores(this._currentSchema);
      this.tableMap.set(nodesKey, this.table(nodesKey));
      this.tableMap.set(edgesKey, this.table(edgesKey));
    }

    return {
      nodesTable: this.tableMap.get(nodesKey)!,
      edgesTable: this.tableMap.get(edgesKey)!,
    };
  }
}

/**
 * Internal database client. Wraps Dexie and manages collection instances.
 * Use via {@link ZerithDBApp.db} — not instantiated directly.
 */
export class DbClient {
  private readonly dexie: ZerithDBDexie;
  private readonly appId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly collections = new Map<string, CollectionClient<any>>();

  private readonly graphs = new Map<string, GraphClient<any>>();

  constructor(
    config: ZerithDBConfig,
    private readonly auth?: any
  ) {
    this.appId = config.appId;
    this.dexie = new ZerithDBDexie(config.appId);
  }

  collection<T extends Record<string, any>>(name: string): CollectionClient<T> {
    if (typeof name !== "string" || name.trim() === "") {
      throw new ZerithDBError(
        ErrorCode.DB_INIT_FAILED,
        "Collection name must be a non-empty string"
      );
    }
    if (!this.collections.has(name)) {
      const table = this.dexie.ensureCollection(name);
      this.collections.set(
        name,
        new CollectionClient<T>(table as Table<Document<T>>, name, this.auth)
      );
    }
    return this.collections.get(name) as CollectionClient<T>;
  }

  graph<T extends Record<string, any> = Record<string, any>>(name: string): GraphClient<T> {
    if (!this.graphs.has(name)) {
      const { nodesTable, edgesTable } = this.dexie.ensureGraphTables(name);
      this.graphs.set(
        name,
        new GraphClient<T>(nodesTable as Table<GraphNode<T>>, edgesTable as Table<GraphEdge>, name)
      );
    }
    return this.graphs.get(name) as GraphClient<T>;
  }

  async getMemoryStats(): Promise<{ recordCount: number; collections: Record<string, number> }> {
    const collections: Record<string, number> = {};
    let recordCount = 0;

    for (const [name, client] of this.collections) {
      const count = await client.count();
      collections[name] = count;
      recordCount += count;
    }

    return { recordCount, collections };
  }

  /**
   * Returns names of collections that have been opened in this session.
   */
  collectionNames(): string[] {
    return Array.from(this.collections.keys());
  }

  /**
   * Returns names of all collections currently stored in IndexedDB.
   */
  allCollectionNames(): string[] {
    return this.dexie.tables.map((t) => t.name);
  }

  /**
   * Export all collections to a JSON-serializable snapshot.
   * If options.collections is omitted, it exports ALL collections found in IndexedDB.
   */
  async exportSnapshot(options: BackupExportOptions = {}): Promise<BackupSnapshot> {
    if (this.auth?.biometric?.isBiometricRequiredForDB()) {
      const authorized = await this.auth.biometric.promptBiometric(
        "Authorize sensitive operation: Export full database backup snapshot"
      );
      if (!authorized) {
        throw new ZerithDBError(
          ErrorCode.AUTH_SIGN_FAILED,
          "Database export cancelled or biometric authentication failed."
        );
      }
    }

    return wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      "Failed to export local backup snapshot",
      async () => {
        const collectionNames = options.collections ?? this.allCollectionNames();
        const collections: BackupSnapshot["collections"] = {};

        for (const name of collectionNames) {
          const table = this.dexie.ensureCollection(name);
          collections[name] = (await table.toArray()) as Document<Record<string, any>>[];
        }

        return {
          format: "zerithdb.local-backup.v1",
          appId: this.appId,
          generatedAt: new Date().toISOString(),
          collections,
        };
      }
    );
  }
  async dispose(): Promise<void> {
    this.dexie.close();
  }
}
