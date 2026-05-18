/**
 * Benchmark script for ZerithDB query performance: Cursors vs Full Scan
 */

import "fake-indexeddb/auto";
import { DbClient } from "../packages/db/src/index.ts";
import { performance } from "node:perf_hooks";

async function runBenchmark() {
  const appId = `benchmark-query-${Date.now()}`;
  const db = new DbClient({ appId } as any);
  const col = db.collection<{ v: number; text: string }>("test");

  const COUNT = 10000; // Increased to 10k for more meaningful metrics
  console.log(`Generating ${COUNT} documents...`);
  const docs = [];
  for (let i = 0; i < COUNT; i++) {
    docs.push({ v: i, text: `Doc ${i}` });
  }

  console.log("Inserting documents...");
  await col.insertMany(docs);

  console.log("\nRunning Query Benchmarks (Direct zerithdb-db):");
  console.log("----------------------------------------------");

  // 1. Full Scan (all documents)
  const startFull = performance.now();
  const allDocs = await col.find({});
  const endFull = performance.now();
  console.log(
    `Full Scan (find all): ${allDocs.length} docs, ${(endFull - startFull).toFixed(2)}ms`
  );

  // 2. Paginated Scan (limit 10) - Now faster with .until() termination
  const startPaged = performance.now();
  const pagedDocs = await col.find({}, { limit: 10 });
  const endPaged = performance.now();
  console.log(
    `Paginated (limit 10): ${pagedDocs.length} docs, ${(endPaged - startPaged).toFixed(2)}ms`
  );

  // 3. Skip/Offset Test
  const startOffset = performance.now();
  const offsetDocs = await col.find({}, { offset: 1000, limit: 10 });
  const endOffset = performance.now();
  console.log(
    `Offset 1000 + Limit 10: ${offsetDocs.length} docs, ${(endOffset - startOffset).toFixed(2)}ms`
  );

  await db.dispose();
}

runBenchmark().catch(console.error);
