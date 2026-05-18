// ─────────────────────────────────────────────────────────────────────────────
// Supabase / PostgreSQL Adapter
// Reads all tables from a Supabase project (via the REST API), resolves
// foreign key relationships, and converts rows to ZerithDB documents.
// ─────────────────────────────────────────────────────────────────────────────

import { v4 as uuidv4 } from "uuid";
import { mapSupabaseType, createZerithDocument } from "../converters/schema.js";
import type {
  SupabaseConfig,
  AdapterOptions,
  MigrationProgress,
  ZerithDocument,
} from "../types.js";

export async function migrateSupabase(
  config: SupabaseConfig,
  options: AdapterOptions,
  onProgress: (p: MigrationProgress) => void
): Promise<Record<string, ZerithDocument[]>> {
  const nodeId = options.nodeId ?? `migration-${uuidv4()}`;
  const batchSize = options.batchSize ?? 1000;

  const { createClient } = await import("@supabase/supabase-js").catch(() => {
    throw new Error("@supabase/supabase-js is not installed. Run: pnpm add @supabase/supabase-js");
  });

  const supabase = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // ── Discover tables ───────────────────────────────────────────────────────

  let tables: string[];

  if (config.tables && config.tables.length > 0) {
    tables = config.tables;
  } else {
    // Query information_schema to list all public tables
    const { data: tableData, error: tableError } = await supabase
      .from("information_schema.tables")
      .select("table_name")
      .eq("table_schema", "public")
      .eq("table_type", "BASE TABLE");

    if (tableError) {
      throw new Error(`Failed to list tables: ${tableError.message}`);
    }

    tables = (tableData ?? []).map((row: Record<string, unknown>) => row.table_name as string);
  }

  tables = filterTables(tables, options);

  // ── Resolve foreign keys for all tables ──────────────────────────────────
  // We query information_schema.key_column_usage to know which columns are FKs
  // so the converter can turn them into _ref objects.

  const foreignKeyMap = await resolveForeignKeys(supabase, tables);

  // ── Migrate each table ────────────────────────────────────────────────────

  const result: Record<string, ZerithDocument[]> = {};

  for (const table of tables) {
    const foreignKeys = foreignKeyMap.get(table) ?? new Set<string>();

    // Get row count for progress
    const { count, error: countError } = await supabase
      .from(table)
      .select("*", { count: "exact", head: true });

    if (countError) {
      onProgress({
        adapter: "supabase",
        collection: table,
        processed: 0,
        total: -1,
        warning: `Could not count rows in "${table}": ${countError.message}`,
      });
    }

    const total = count ?? -1;
    const docs: ZerithDocument[] = [];
    let processed = 0;
    let offset = 0;

    onProgress({ adapter: "supabase", collection: table, processed: 0, total });

    // Paginate through the table
    for (;;) {
      const { data: rows, error: fetchError } = await supabase
        .from(table)
        .select("*")
        .range(offset, offset + batchSize - 1);

      if (fetchError) {
        onProgress({
          adapter: "supabase",
          collection: table,
          processed,
          total,
          warning: `Error fetching rows at offset ${offset}: ${fetchError.message}`,
        });
        break;
      }

      if (!rows || rows.length === 0) break;

      for (const row of rows as Record<string, unknown>[]) {
        try {
          const convertedData: Record<string, unknown> = {};

          for (const [col, val] of Object.entries(row)) {
            // Skip internal metadata columns — they become ZerithDocument fields
            if (["created_at", "updated_at", "id"].includes(col)) continue;
            convertedData[col] = mapSupabaseType(col, val, foreignKeys);
          }

          // Determine the original primary key (prefer "id")
          const originalId = row["id"] !== undefined ? String(row["id"]) : uuidv4();

          const createdAt = extractDate(row["created_at"]);
          const updatedAt = extractDate(row["updated_at"]);

          const doc = createZerithDocument({
            collection: table,
            data: row,
            originalId,
            adapterType: "supabase",
            nodeId,
            ...(createdAt !== undefined ? { createdAt } : {}),
            ...(updatedAt !== undefined ? { updatedAt } : {}),
          });
          docs.push(doc);
        } catch (err) {
          onProgress({
            adapter: "supabase",
            collection: table,
            processed,
            total,
            warning: `Failed to convert row: ${String(err)}`,
          });
        }

        processed++;
      }

      offset += batchSize;
      onProgress({ adapter: "supabase", collection: table, processed, total });

      if (rows.length < batchSize) break;
    }

    result[table] = docs;
  }

  return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveForeignKeys(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  tables: string[]
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();

  try {
    // Join referential_constraints + constraint_column_usage to get only true
    // FOREIGN KEY columns AND their referenced table (for _refCollection).
    const { data, error } = await supabase
      .from("information_schema.referential_constraints")
      .select(
        `
        constraint_name,
        information_schema.key_column_usage!inner(table_name, column_name),
        information_schema.constraint_column_usage!inner(table_name)
      `
      )
      .eq("constraint_schema", "public")
      .in("information_schema.key_column_usage.table_name", tables);

    if (error || !data) return map;

    for (const row of data as Array<{
      information_schema: {
        key_column_usage: { table_name: string; column_name: string };
        constraint_column_usage: { table_name: string };
      };
    }>) {
      const kcu = row["information_schema"]["key_column_usage"];
      const referencedTable = row["information_schema"]["constraint_column_usage"].table_name;
      if (!map.has(kcu.table_name)) {
        map.set(kcu.table_name, new Set());
      }
      // Store column → referenced table so mapSupabaseType can set _refCollection correctly
      map.get(kcu.table_name)!.add(kcu.column_name + ":" + referencedTable);
    }
  } catch {
    // Non-fatal — we'll just skip FK resolution
  }

  return map;
}

function filterTables(tables: string[], opts: AdapterOptions): string[] {
  let result = tables;
  if (opts.include && opts.include.length > 0) {
    result = result.filter((t) => opts.include!.includes(t));
  }
  if (opts.exclude && opts.exclude.length > 0) {
    result = result.filter((t) => !opts.exclude!.includes(t));
  }
  return result;
}

function extractDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return val;
  if (typeof val === "string") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}
