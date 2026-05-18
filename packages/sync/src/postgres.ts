import * as Y from "yjs";
import { EventEmitter } from "zerithdb-core";

/**
 * Represents a single column value in a PostgreSQL logical replication event.
 */
export interface PgColumn {
  name: string;
  value: any;
  type?: string;
}

/**
 * Represents a PostgreSQL Write-Ahead Log (WAL) change event.
 */
export interface PostgresWalEvent {
  action: "INSERT" | "UPDATE" | "DELETE";
  schema: string;
  table: string;
  columns?: PgColumn[];
  identity?: PgColumn[];
}

/**
 * Configuration options for the PostgresReplicationAdapter.
 */
export interface PostgresReplicationConfig {
  /**
   * Maps full table names (e.g. "public.todos" or just "todos") to their primary key columns and target ZerithDB collections.
   */
  schemaMap: Record<
    string,
    {
      primaryKey: string;
      collectionName: string;
      schema?: string;
      table?: string;
    }
  >;
}

/**
 * Server-side adapter that bridges PostgreSQL logical replication streams and client-side ZerithDB collections.
 * Handles bi-directional synchronization by converting WAL change streams into Yjs updates and vice versa.
 */
export class PostgresReplicationAdapter extends EventEmitter<any> {
  private readonly docs = new Map<string, Y.Doc>();

  constructor(private readonly config: PostgresReplicationConfig) {
    super();
    // Normalize schemaMap configuration
    for (const [key, value] of Object.entries(this.config.schemaMap)) {
      if (!value.schema || !value.table) {
        const parts = key.split(".");
        value.schema = parts.length > 1 ? parts[0] : "public";
        value.table = parts.length > 1 ? parts[1] : key;
      }
    }
  }

  /**
   * Retrieves or creates a server-side Yjs replica Doc for a ZerithDB collection.
   */
  getDoc(collectionName: string): Y.Doc {
    if (this.docs.has(collectionName)) {
      return this.docs.get(collectionName)!;
    }
    const doc = new Y.Doc();
    this.docs.set(collectionName, doc);
    return doc;
  }

  /**
   * Helper to retrieve table configuration matching a given collection name.
   */
  private getTableConfig(collectionName: string) {
    for (const config of Object.values(this.config.schemaMap)) {
      if (config.collectionName === collectionName) {
        return config;
      }
    }
    return null;
  }

  /**
   * Translates a PostgreSQL WAL change stream event into a ZerithDB-compatible Yjs update.
   * Modifies the local server Yjs replica doc and returns the binary Yjs update payload.
   *
   * @param event The PostgreSQL logical replication WAL event.
   * @returns An object containing the target collection and binary Yjs update payload to stream to clients, or null.
   */
  handleWalEvent(event: PostgresWalEvent): { collectionName: string; update: Uint8Array } | null {
    const tableKey = `${event.schema}.${event.table}`;
    const tableConfig = this.config.schemaMap[tableKey] || this.config.schemaMap[event.table];
    if (!tableConfig) return null;

    const doc = this.getDoc(tableConfig.collectionName);
    const dataMap = doc.getMap("data");

    let updatePayload: Uint8Array | null = null;
    const onUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin === "postgres-wal") {
        updatePayload = update;
      }
    };

    doc.on("update", onUpdate);
    try {
      doc.transact(() => {
        if (event.action === "DELETE") {
          const idCol = event.identity?.find((c) => c.name === tableConfig.primaryKey);
          if (idCol) {
            dataMap.delete(String(idCol.value));
          }
        } else {
          // INSERT or UPDATE
          const idCol = event.columns?.find((c) => c.name === tableConfig.primaryKey);
          if (idCol) {
            const rowData: Record<string, any> = {};
            if (event.columns) {
              for (const col of event.columns) {
                rowData[col.name] = col.value;
              }
            }
            dataMap.set(String(idCol.value), rowData);
          }
        }
      }, "postgres-wal");
    } finally {
      doc.off("update", onUpdate);
    }

    if (updatePayload) {
      return {
        collectionName: tableConfig.collectionName,
        update: updatePayload,
      };
    }
    return null;
  }

  /**
   * Translates a client-side ZerithDB Yjs binary update back into safe, parameterized PostgreSQL SQL statements.
   * Applies the update to the server-side Yjs replica doc and generates corresponding UPSERT/DELETE SQL command.
   *
   * @param collectionName The target ZerithDB collection name.
   * @param update The binary Yjs update received from the client.
   * @returns An array of SQL commands containing the parameterized query and parameter values.
   */
  async handleClientUpdate(
    collectionName: string,
    update: Uint8Array
  ): Promise<Array<{ type: "UPSERT" | "DELETE"; sql: string; values: any[] }>> {
    const doc = this.getDoc(collectionName);
    const tableConfig = this.getTableConfig(collectionName);
    if (!tableConfig) return [];

    const dataMap = doc.getMap("data");
    const sqlCommands: Array<{ type: "UPSERT" | "DELETE"; sql: string; values: any[] }> = [];

    // Capture the modified keys during update application
    const changedKeys = new Set<string>();
    const onUpdate = (_update: Uint8Array, origin: unknown, _doc: Y.Doc, transaction: Y.Transaction) => {
      if (origin === "postgres-wal") return;
      const changed = transaction.changed.get(dataMap);
      if (changed) {
        for (const key of changed) {
          changedKeys.add(key);
        }
      }
    };

    doc.on("update", onUpdate);
    try {
      Y.applyUpdate(doc, update, "client");
    } finally {
      doc.off("update", onUpdate);
    }

    // Convert each modified key to the corresponding SQL command
    for (const key of changedKeys) {
      const row = dataMap.get(key);
      if (row === undefined) {
        // Row was deleted in the CRDT, so delete it in Postgres
        const sql = `DELETE FROM "${tableConfig.schema}"."${tableConfig.table}" WHERE "${tableConfig.primaryKey}" = $1;`;
        sqlCommands.push({
          type: "DELETE",
          sql,
          values: [key],
        });
      } else {
        // Row was inserted/updated in the CRDT, so upsert it in Postgres
        const rowObj = typeof row === "string" ? JSON.parse(row) : (row as Record<string, any>);
        
        // Ensure primary key value is present and matches the key in the map
        rowObj[tableConfig.primaryKey] = key;

        const columns = Object.keys(rowObj);
        const columnNames = columns.map((c) => `"${c}"`).join(", ");
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
        
        const updateAssignments = columns
          .filter((c) => c !== tableConfig.primaryKey)
          .map((c) => {
            const valIdx = columns.indexOf(c) + 1;
            return `"${c}" = $${valIdx}`;
          })
          .join(", ");

        const values = columns.map((c) => rowObj[c]);

        let sql = "";
        if (updateAssignments.length > 0) {
          sql = `INSERT INTO "${tableConfig.schema}"."${tableConfig.table}" (${columnNames}) VALUES (${placeholders}) ON CONFLICT ("${tableConfig.primaryKey}") DO UPDATE SET ${updateAssignments};`;
        } else {
          sql = `INSERT INTO "${tableConfig.schema}"."${tableConfig.table}" (${columnNames}) VALUES (${placeholders}) ON CONFLICT ("${tableConfig.primaryKey}") DO NOTHING;`;
        }

        sqlCommands.push({
          type: "UPSERT",
          sql,
          values,
        });
      }
    }

    return sqlCommands;
  }
}

/**
 * A highly reliable, 100% Javascript compatible PostgreSQL WAL Streamer.
 * Uses logical slot polling (via standard SQL commands) for max portability, compatibility
 * with hosted databases (Supabase, Neon, RDS), and easy testing/mocking.
 */
export class PostgresWALStreamer extends EventEmitter<any> {
  private active = false;
  private timerId: any = null;

  constructor(
    private readonly pgClient: any, // Accepts standard 'pg' client or mock
    private readonly slotName: string = "zerithdb_slot",
    private readonly publicationName: string = "zerithdb_pub"
  ) {
    super();
  }

  /**
   * Initializes PostgreSQL logical replication slot and publication automatically.
   */
  async setup(): Promise<void> {
    try {
      // Create publication if not exists
      await this.pgClient.query(`CREATE PUBLICATION "${this.publicationName}" FOR ALL TABLES;`).catch(() => {});
      // Create logical slot if not exists using standard wal2json logical decoding plugin
      await this.pgClient
        .query(`SELECT pg_create_logical_replication_slot('${this.slotName}', 'wal2json');`)
        .catch(() => {});
    } catch (err: any) {
      this.emit("error", new Error(`Failed to set up replication resources: ${err.message}`));
    }
  }

  /**
   * Starts polling WAL changes from the logical replication slot.
   */
  start(pollIntervalMs = 200): void {
    if (this.active) return;
    this.active = true;

    const poll = async () => {
      if (!this.active) return;
      try {
        // Query logical slot changes using the standard SQL polling method
        const result = await this.pgClient.query(
          `SELECT * FROM pg_logical_slot_get_changes('${this.slotName}', NULL, NULL);`
        );
        
        if (result && result.rows) {
          for (const row of result.rows) {
            // Decodes the logical stream payload (wal2json format)
            const payload = typeof row.data === "string" ? JSON.parse(row.data) : row.data;
            if (payload && payload.change) {
              for (const change of payload.change) {
                let action: PostgresWalEvent["action"];
                if (change.kind === "insert") {
                  action = "INSERT";
                } else if (change.kind === "update") {
                  action = "UPDATE";
                } else if (change.kind === "delete") {
                  action = "DELETE";
                } else {
                  this.emit("error", new Error(`Unsupported WAL change kind: ${change.kind}`));
                  continue;
                }

                const walEvent: PostgresWalEvent = {
                  action,
                  schema: change.schema,
                  table: change.table,
                  columns: change.columnnames?.map((name: string, i: number) => ({
                    name,
                    value: change.columnvalues[i],
                  })),
                  identity: change.oldkeys?.keynames?.map((name: string, i: number) => ({
                    name,
                    value: change.oldkeys.keyvalues[i],
                  })),
                };
                
                // If deletion, fallback to keynames or use key columns directly
                if (change.kind === "delete") {
                  walEvent.identity = change.oldkeys?.keynames?.map((name: string, i: number) => ({
                    name,
                    value: change.oldkeys.keyvalues[i],
                  })) || change.columnnames?.map((name: string, i: number) => ({
                    name,
                    value: change.columnvalues[i],
                  }));
                }

                this.emit("change", walEvent);
              }
            }
          }
        }
      } catch (err: any) {
        this.emit("error", err);
      } finally {
        if (this.active) {
          this.timerId = setTimeout(poll, pollIntervalMs);
        }
      }
    };

    this.timerId = setTimeout(poll, pollIntervalMs);
  }

  /**
   * Stops the streamer and cleans up resources.
   */
  stop(): void {
    this.active = false;
    if (this.timerId) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }
}
