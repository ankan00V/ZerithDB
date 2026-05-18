import { Logger } from "zerithdb-core";
import type { Document, Identity, QueryFilter, SyncState, ZerithDBConfig } from "zerithdb-core";
export type { Document, Identity, QueryFilter, SyncState, ZerithDBConfig };
import { MemoryCollector, estimateStorageBytes } from "zerithdb-devtools";
import { ZerithDBError, ErrorCode } from "zerithdb-core";
import { DbClient, CollectionClient } from "zerithdb-db";
import type { CloudBackupTarget, LocalCloudBackupOptions } from "zerithdb-db";
import { LocalCloudBackupAdapter } from "zerithdb-db";
import { SyncEngine } from "zerithdb-sync";
import { AuthManager } from "zerithdb-auth";
import { NetworkManager } from "zerithdb-network";

/**
 * The root ZerithDB application instance returned by {@link createApp}.
 */
export interface ZerithDBApp {
  /**
   * Access a database collection by name.
   * The collection is created lazily on first use.
   *
   * @param name - Collection name (e.g. `"todos"`, `"messages"`)
   * @returns A typed {@link DbClient} for querying and mutating documents.
   *
   * @example
   * ```typescript
   * const todos = app.db("todos");
   * await todos.insert({ text: "Hello", done: false });
   * const all = await todos.find({});
   * ```
   */
  db<T extends Record<string, any> = Record<string, any>>(name: string): CollectionClient<T>;

  /** CRDT sync engine — manages Yjs documents and P2P update propagation */
  sync: SyncEngine;

  /** Authentication manager — keypair identity and message signing */
  auth: AuthManager;

  /** P2P network manager — WebRTC peer connections and signaling */
  network: NetworkManager;

  /**
   * Create a local cloud backup adapter. The adapter exports configured
   * IndexedDB collections and uploads the JSON snapshot through the target.
   */
  backup(target: CloudBackupTarget, options?: LocalCloudBackupOptions): LocalCloudBackupAdapter;

  /** Underlying app configuration */
  config: Readonly<ZerithDBConfig>;

  /**
   * Tear down the application — close all peer connections, stop sync,
   * and release database handles.
   */
  dispose(): Promise<void>;
}

/**
 * Creates a new ZerithDB application instance.
 *
 * This is the primary entry point to the ZerithDB SDK.
 * All database, sync, auth, and network operations flow through this instance.
 *
 * @param config - Application configuration
 * @returns A configured {@link ZerithDBApp}
 *
 * @example
 * ```typescript
 * import { createApp } from "zerithdb-sdk";
 *
 * const app = createApp({
 *   appId: "my-todo-app",
 *   sync: { signalingUrl: "wss://signal.zerithdb.dev" },
 *   debug: { devtools: true },
 * });
 *
 * await app.db("todos").insert({ text: "Ship ZerithDB v1", done: false });
 * app.sync.enable();
 * ```
 */

function isIndexedDBAvailable(): boolean {
  try {
    return typeof indexedDB !== "undefined";
  } catch {
    return false;
  }
}

export function createApp(config: ZerithDBConfig): ZerithDBApp {
  if (!isIndexedDBAvailable()) {
    throw new ZerithDBError(
      ErrorCode.SDK_NOT_INITIALIZED,
      "IndexedDB is unavailable in this browser environment. ZerithDB requires IndexedDB support. Try disabling private/incognito restrictions or use a supported browser."
    );
  }

  if (!config.appId || config.appId.trim().length === 0) {
    throw new ZerithDBError(
      ErrorCode.SDK_INVALID_CONFIG,
      'createApp requires a non-empty "appId" in config'
    );
  }

  const resolvedConfig: ZerithDBConfig = {
    logLevel: "warn",
    ...config,
    sync: {
      signalingUrl: "wss://signal.zerithdb.dev",
      maxPeers: 10,
      transport: "auto",
      ...config.sync,
    },
    auth: {
      storageKey: "__zerithdb_identity",
      ...config.auth,
    },
    network: {
      autoReconnect: true,
      reconnectDelay: 1000,
      ...config.network,
    },
  };

  const logger = new Logger(resolvedConfig, "SDK");
  logger.info("Initializing ZerithDB app", { appId: resolvedConfig.appId });

  const auth = new AuthManager(resolvedConfig);
  const db = new DbClient(resolvedConfig, auth);
  const network = new NetworkManager(resolvedConfig, auth);
  const sync = new SyncEngine(resolvedConfig, db, network);

  let memoryCollector: MemoryCollector | null = null;
  if (resolvedConfig.debug?.devtools === true) {
    memoryCollector = new MemoryCollector({
      measureIndexedDB: async () => {
        const [totalBytes, dbStats] = await Promise.all([
          estimateStorageBytes(),
          db.getMemoryStats(),
        ]);
        return {
          totalBytes,
          recordCount: dbStats.recordCount,
          collections: dbStats.collections,
        };
      },
      measureWebRTC: () => network.getBufferStats(),
    });
    memoryCollector.start();
  }

  const backupAdapters = new Set<LocalCloudBackupAdapter>();

  return {
    config: Object.freeze(resolvedConfig),

    db<T extends Record<string, any>>(name: string): CollectionClient<T> {
      // DbClient already caches collection instances internally —
      // no need for a second cache layer here.
      return db.collection<T>(name);
    },

    sync,
    auth,
    network,

    backup(target: CloudBackupTarget, options?: LocalCloudBackupOptions): LocalCloudBackupAdapter {
      const adapter = new LocalCloudBackupAdapter(db, target, options);
      backupAdapters.add(adapter);
      return adapter;
    },

    async dispose(): Promise<void> {
      memoryCollector?.stop();
      await Promise.all(Array.from(backupAdapters).map((a) => a.stop()));
      backupAdapters.clear();
      await Promise.all([sync.dispose(), network.dispose(), db.dispose()]);
    },
  };
}
