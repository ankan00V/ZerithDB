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
import { uploadLargeFiles, downloadLargeFiles, DefaultIpfsProvider } from "./ipfs.js";

/**
 * A handle to a single named collection within the ZerithDB local database.
 * All operations are async and backed by IndexedDB.
 */
export class CollectionClient<T extends Record<string, any> = Record<string, any>> {
  constructor(
    private readonly table: Table<Document<T>>,
    private readonly collectionName: string,
    private readonly config?: ZerithDBConfig,
    private readonly dexie?: ZerithDBDexie
  ) {}

  /**
   * Subscribe to changes in the collection.
   * Uses Dexie's liveQuery to reactively notify when documents change.
   *
   * @param callback - Function called with the updated list of all documents
   * @returns An unsubscribe function
   */
  subscribe(callback: (documents: Document<T>[]) => void): () => void {
    const observable = liveQuery(() => this.find());
    const subscription = observable.subscribe({
      next: (docs) => callback(docs),
      error: (err) => console.error(`Error in collection subscription:`, err),
    });
    return () => subscription.unsubscribe();
  }

  /**
   * Insert a new document into the collection.
   * Automatically assigns `_id`, `_createdAt`, and `_updatedAt`.
   */
  private async restoreIpfsReferences(doc: Document<T>): Promise<Document<T>> {
    if (!this.config?.ipfs?.enabled) return doc;

    const cacheTable = this.dexie?.ensureIpfsCacheTable();
    const cacheGet = async (cid: string) => {
      if (!cacheTable) return undefined;
      return Dexie.ignoreTransaction(async () => {
        const entry = await cacheTable.get(cid);
        return entry?.data;
      });
    };
    const cacheSet = async (cid: string, data: Blob | Uint8Array) => {
      if (!cacheTable) return;
      await Dexie.ignoreTransaction(async () => {
        await cacheTable.put({ cid, data, cachedAt: Date.now() });
      });
    };

    const provider =
      this.config.ipfs.provider ??
      new DefaultIpfsProvider(this.config.ipfs.apiUrl, this.config.ipfs.gatewayUrl);
    const fetchFn = async (cid: string): Promise<Blob> => {
      if (!this.dexie) {
        return provider.fetch(cid);
      }
      let active = this.dexie.activeFetches.get(cid);
      if (!active) {
        active = provider.fetch(cid).finally(() => {
          this.dexie?.activeFetches.delete(cid);
        });
        this.dexie.activeFetches.set(cid, active);
      }
      return active;
    };

    return downloadLargeFiles(doc, fetchFn, cacheGet, cacheSet);
  }

  async insert(document: T): Promise<InsertResult> {
    if (document === null || document === undefined) {
      throw new ZerithDBError(ErrorCode.DB_WRITE_FAILED, "Document cannot be null or undefined");
    }
    let docToInsert = { ...document };
    if (this.config?.ipfs?.enabled) {
      const sizeThreshold = this.config.ipfs.sizeThreshold ?? 0;
      const provider =
        this.config.ipfs.provider ??
        new DefaultIpfsProvider(this.config.ipfs.apiUrl, this.config.ipfs.gatewayUrl);
      const uploadFn = (data: Blob | Uint8Array) => provider.upload(data);
      docToInsert = await uploadLargeFiles(docToInsert, sizeThreshold, uploadFn);
    }

    const now = Date.now();
    const id = uuidv7();
    const doc: Document<T> = {
      ...docToInsert,
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
    for (const doc of documents) {
      if (doc === null || doc === undefined) {
        throw new ZerithDBError(
          ErrorCode.DB_WRITE_FAILED,
          "Documents array cannot contain null or undefined"
        );
      }
    }

    const processedDocs: T[] = [];
    if (this.config?.ipfs?.enabled) {
      const sizeThreshold = this.config.ipfs.sizeThreshold ?? 0;
      const provider =
        this.config.ipfs.provider ??
        new DefaultIpfsProvider(this.config.ipfs.apiUrl, this.config.ipfs.gatewayUrl);
      const uploadFn = (data: Blob | Uint8Array) => provider.upload(data);
      for (const doc of documents) {
        processedDocs.push(await uploadLargeFiles(doc, sizeThreshold, uploadFn));
      }
    } else {
      processedDocs.push(...documents);
    }

    const now = Date.now();
    const docs = processedDocs.map((doc) => ({
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
  async find(
    filter: QueryFilter<T> = {},
    options: QueryOptions = {},
    restoreIpfs = true
  ): Promise<Document<T>[]> {
    const results = await wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to query collection "${this.collectionName}"`,
      async () => {
        const compiledFilter = this.precompileRegexes(filter);
        const results: Document<T>[] = [];
        let skipped = 0;
        const offset = options.offset ?? 0;
        const limit = options.limit ?? Number.POSITIVE_INFINITY;

        await this.table
          .toCollection()
          .until(() => results.length >= limit)
          .each((doc) => {
            if (this.matchesFilter(doc, compiledFilter)) {
              if (skipped < offset) {
                skipped++;
              } else {
                results.push(doc);
              }
            }
          });

        return results;
      }
    );

    if (restoreIpfs && this.config?.ipfs?.enabled) {
      const restoredResults: Document<T>[] = [];
      for (const doc of results) {
        restoredResults.push(await this.restoreIpfsReferences(doc));
      }
      return restoredResults;
    }

    return results;
  }

  /**
   * Find a single document by its `_id`.
   */
  async findById(id: string): Promise<Document<T> | undefined> {
    const doc = await wrapIDBOperation(
      ErrorCode.DB_READ_FAILED,
      `Failed to get document "${id}" from "${this.collectionName}"`,
      () => this.table.get(id)
    );
    if (!doc) return undefined;
    return this.restoreIpfsReferences(doc);
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
    return wrapIDBOperation(
      ErrorCode.DB_WRITE_FAILED,
      `Failed to update documents in "${this.collectionName}"`,
      async () => {
        // Query RAW documents (with IPFS references untouched) so we don't write restored Blobs back to IndexedDB!
        const matches = await this.find(filter, {}, false);

        let processedSpec = { ...spec };
        if (this.config?.ipfs?.enabled && processedSpec.$set) {
          const sizeThreshold = this.config.ipfs.sizeThreshold ?? 0;
          const provider =
            this.config.ipfs.provider ??
            new DefaultIpfsProvider(this.config.ipfs.apiUrl, this.config.ipfs.gatewayUrl);
          const uploadFn = (data: Blob | Uint8Array) => provider.upload(data);
          processedSpec = {
            ...processedSpec,
            $set: await uploadLargeFiles(processedSpec.$set, sizeThreshold, uploadFn),
          };
        }

        const now = Date.now();
        await this.table.bulkPut(
          matches.map((doc) => this.applyUpdateSpec(doc, processedSpec, now))
        );
        return matches.length;
      }
    );
  }

  /**
   * Delete documents matching a filter.
   * Returns the number of deleted documents.
   */
  async delete(filter: QueryFilter<T>): Promise<number> {
    return wrapIDBOperation(
      ErrorCode.DB_DELETE_FAILED,
      `Failed to delete documents from "${this.collectionName}"`,
      async () => {
        // Use raw find to avoid loading from IPFS during delete query
        const matches = await this.find(filter, {}, false);
        await this.table.bulkDelete(matches.map((d) => d._id));
        return matches.length;
      }
    );
  }

  /**
   * Delete every document in the collection.
   */
  async clearAll(): Promise<void> {
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

        const regex =
          conditions.$regex instanceof RegExp ? conditions.$regex : new RegExp(conditions.$regex);

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
          const regex = conditions["$regex"];
          conditions["$regex"] = regex instanceof RegExp ? regex : new RegExp(regex);
        }
        compiled[key] = conditions;
      } else {
        compiled[key] = condition;
      }
    }
    return compiled as QueryFilter<T>;
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
  readonly activeFetches = new Map<string, Promise<Blob>>();

  constructor(appId: string) {
    super(`zerithdb_${appId}`);
  }

  ensureIpfsCacheTable(): Table {
    const key = "__ipfs_cache";
    if (!this.tableMap.has(key)) {
      this._currentSchema[key] = "cid, cachedAt";

      const nextVersion = Math.max(this.verno, this._pendingVersion) + 1;
      this._pendingVersion = nextVersion;

      if (this.isOpen()) {
        this.close();
      }

      this.version(nextVersion).stores(this._currentSchema);
      this.tableMap.set(key, this.table(key));
    }
    return this.table(key);
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
    return this.table(name);
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

  constructor(private readonly config: ZerithDBConfig) {
    this.appId = config.appId;
    this.dexie = new ZerithDBDexie(config.appId);
    if (config.ipfs?.enabled) {
      this.dexie.ensureIpfsCacheTable();
    }
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
        new CollectionClient<T>(table as Table<Document<T>>, name, this.config, this.dexie)
      );
    }
    return this.collections.get(name) as CollectionClient<T>;
  }

  /**
   * Clears the local IPFS/Filecoin binary cache.
   */
  async clearIpfsCache(): Promise<void> {
    if (this.config.ipfs?.enabled) {
      const table = this.dexie.ensureIpfsCacheTable();
      await Dexie.ignoreTransaction(() => table.clear());
    }
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
