import { describe, it, expect, beforeEach } from "vitest";
import * as Y from "yjs";
import { PostgresReplicationAdapter, PostgresWALStreamer, type PostgresWalEvent } from "../../packages/sync/src/index.js";

describe("PostgreSQL Logical Replication & Change Streams", () => {
  let adapter: PostgresReplicationAdapter;
  const schemaConfig = {
    schemaMap: {
      "public.todos": {
        primaryKey: "id",
        collectionName: "todos",
      },
    },
  };

  beforeEach(() => {
    adapter = new PostgresReplicationAdapter(schemaConfig);
  });

  describe("Postgres to ZerithDB (Downstream Replication)", () => {
    it("should successfully translate an INSERT WAL event into a Yjs update", () => {
      const clientDoc = new Y.Doc();
      const clientMap = clientDoc.getMap("data");

      // 1. Construct a PG INSERT WAL event
      const insertEvent: PostgresWalEvent = {
        action: "INSERT",
        schema: "public",
        table: "todos",
        columns: [
          { name: "id", value: "todo-101" },
          { name: "title", value: "Implement logical replication" },
          { name: "done", value: false },
        ],
      };

      // 2. Process with the adapter on the server side
      const result = adapter.handleWalEvent(insertEvent);
      expect(result).not.toBeNull();
      expect(result!.collectionName).toBe("todos");

      // 3. Apply the generated Yjs binary update payload on the client side
      Y.applyUpdate(clientDoc, result!.update);

      // 4. Assert the client Map matches the state originally in PostgreSQL
      const row = clientMap.get("todo-101") as any;
      expect(row).toBeDefined();
      expect(row.id).toBe("todo-101");
      expect(row.title).toBe("Implement logical replication");
      expect(row.done).toBe(false);
    });

    it("should successfully translate an UPDATE WAL event", () => {
      const clientDoc = new Y.Doc();
      const clientMap = clientDoc.getMap("data");

      // Insert initial item in client state
      const initialEvent: PostgresWalEvent = {
        action: "INSERT",
        schema: "public",
        table: "todos",
        columns: [
          { name: "id", value: "todo-102" },
          { name: "title", value: "Buy groceries" },
          { name: "done", value: false },
        ],
      };
      const initResult = adapter.handleWalEvent(initialEvent);
      Y.applyUpdate(clientDoc, initResult!.update);

      // Now issue an UPDATE WAL event
      const updateEvent: PostgresWalEvent = {
        action: "UPDATE",
        schema: "public",
        table: "todos",
        columns: [
          { name: "id", value: "todo-102" },
          { name: "title", value: "Buy groceries" },
          { name: "done", value: true }, // Changed
        ],
      };

      const updateResult = adapter.handleWalEvent(updateEvent);
      expect(updateResult).not.toBeNull();
      Y.applyUpdate(clientDoc, updateResult!.update);

      const row = clientMap.get("todo-102") as any;
      expect(row.done).toBe(true);
    });

    it("should successfully translate a DELETE WAL event", () => {
      const clientDoc = new Y.Doc();
      const clientMap = clientDoc.getMap("data");

      // Insert initial item
      const initialEvent: PostgresWalEvent = {
        action: "INSERT",
        schema: "public",
        table: "todos",
        columns: [
          { name: "id", value: "todo-103" },
          { name: "title", value: "Watch the stars" },
          { name: "done", value: false },
        ],
      };
      const initResult = adapter.handleWalEvent(initialEvent);
      Y.applyUpdate(clientDoc, initResult!.update);
      expect(clientMap.get("todo-103")).toBeDefined();

      // Now issue a DELETE WAL event
      const deleteEvent: PostgresWalEvent = {
        action: "DELETE",
        schema: "public",
        table: "todos",
        identity: [{ name: "id", value: "todo-103" }],
      };

      const deleteResult = adapter.handleWalEvent(deleteEvent);
      expect(deleteResult).not.toBeNull();
      Y.applyUpdate(clientDoc, deleteResult!.update);

      expect(clientMap.get("todo-103")).toBeUndefined();
    });
  });

  describe("ZerithDB to Postgres (Upstream Bi-directional Replication)", () => {
    it("should convert client UPSERT updates into parameterized SQL queries", async () => {
      const clientDoc = new Y.Doc();
      const clientMap = clientDoc.getMap("data");

      let clientUpdate: Uint8Array | null = null;
      clientDoc.on("update", (update) => {
        clientUpdate = update;
      });

      // 1. Perform a client write operation
      clientMap.set("todo-201", {
        title: "Clean kitchen",
        done: false,
      });

      expect(clientUpdate).not.toBeNull();

      // 2. Feed client update payload to server-side handleClientUpdate
      const sqlCommands = await adapter.handleClientUpdate("todos", clientUpdate!);
      
      expect(sqlCommands.length).toBe(1);
      const command = sqlCommands[0]!;
      expect(command.type).toBe("UPSERT");
      
      // 3. Verify SQL contains correct columns, placeholders, and ON CONFLICT handling
      expect(command.sql).toContain(`INSERT INTO "public"."todos"`);
      expect(command.sql).toContain(`ON CONFLICT ("id") DO UPDATE SET`);
      expect(command.sql).toContain(`"title" = $`);
      expect(command.sql).toContain(`"done" = $`);

      // Verify correct parameterized values
      expect(command.values).toContain("todo-201");
      expect(command.values).toContain("Clean kitchen");
      expect(command.values).toContain(false);
    });

    it("should convert client DELETE updates into parameterized SQL queries", async () => {
      // 1. Create a client Doc and map
      const clientDoc = new Y.Doc();
      const clientMap = clientDoc.getMap("data");
      
      // Perform initial write on client Doc
      clientMap.set("todo-202", {
        title: "Read a book",
        done: false,
      });

      // Synchronize this initial state to the server's replica Doc
      const initialUpdate = Y.encodeStateAsUpdate(clientDoc);
      Y.applyUpdate(adapter.getDoc("todos"), initialUpdate);

      // Now capture updates on the client Doc for the deletion
      let clientUpdate: Uint8Array | null = null;
      clientDoc.on("update", (update) => {
        clientUpdate = update;
      });

      // 2. Client deletes the key locally
      clientMap.delete("todo-202");
      expect(clientUpdate).not.toBeNull();

      // 3. Translate client deletion to SQL on the server replica
      const sqlCommands = await adapter.handleClientUpdate("todos", clientUpdate!);
      expect(sqlCommands.length).toBe(1);
      
      const command = sqlCommands[0]!;
      expect(command.type).toBe("DELETE");
      expect(command.sql).toBe(`DELETE FROM "public"."todos" WHERE "id" = $1;`);
      expect(command.values).toEqual(["todo-202"]);
    });
  });

  describe("PostgresWALStreamer Polling Integration", () => {
    it("should poll WAL slot changes and trigger changes events properly", async () => {
      // Mock PostgreSQL client matching our streamer queries
      const mockPgClient = {
        queriesExecuted: [] as string[],
        query: async (sql: string) => {
          mockPgClient.queriesExecuted.push(sql);
          if (sql.includes("pg_logical_slot_get_changes")) {
            // Emulate wal2json format rows
            return {
              rows: [
                {
                  lsn: "0/16A54B0",
                  xid: 569,
                  data: JSON.stringify({
                    change: [
                      {
                        kind: "insert",
                        schema: "public",
                        table: "todos",
                        columnnames: ["id", "title", "done"],
                        columnvalues: ["todo-301", "Stream WAL", true],
                      },
                    ],
                  }),
                },
              ],
            };
          }
          return { rows: [] };
        },
      };

      const streamer = new PostgresWALStreamer(mockPgClient, "test_slot", "test_pub");

      // Test resource setup
      await streamer.setup();
      expect(mockPgClient.queriesExecuted).toContain(`CREATE PUBLICATION "test_pub" FOR ALL TABLES;`);
      expect(mockPgClient.queriesExecuted[1]).toContain("pg_create_logical_replication_slot");

      // Verify polling triggers change events
      const capturedChanges: PostgresWalEvent[] = [];
      streamer.on("change", (e) => {
        capturedChanges.push(e);
      });

      streamer.start(10); // Poll every 10ms

      // Wait a moment for polling
      await new Promise((r) => setTimeout(r, 40));
      streamer.stop();

      expect(capturedChanges.length).toBeGreaterThanOrEqual(1);
      const first = capturedChanges[0]!;
      expect(first.action).toBe("INSERT");
      expect(first.table).toBe("todos");
      expect(first.columns).toBeDefined();
      expect(first.columns![0]!.name).toBe("id");
      expect(first.columns![0]!.value).toBe("todo-301");
      expect(first.columns![1]!.name).toBe("title");
      expect(first.columns![1]!.value).toBe("Stream WAL");
      expect(first.columns![2]!.name).toBe("done");
      expect(first.columns![2]!.value).toBe(true);
    });
  });
});
