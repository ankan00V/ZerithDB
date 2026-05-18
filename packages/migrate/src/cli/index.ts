#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// zerithdb-migrate CLI
// Usage: zerithdb-migrate <source> [options]
// ─────────────────────────────────────────────────────────────────────────────

import { Command } from "commander";
import chalk from "chalk";
import cliProgress from "cli-progress";
import ora from "ora";
import { readFile } from "fs/promises";
import { resolve } from "path";

import { migrate } from "../migrator.js";
import type { MigrationProgress } from "../types.js";

const program = new Command();

program
  .name("zerithdb-migrate")
  .description(
    "Migrate data from Firebase Realtime DB, Firestore, or Supabase to ZerithDB local-first format"
  )
  .version("0.1.0");

// ── firebase-realtime subcommand ─────────────────────────────────────────────

program
  .command("firebase-realtime")
  .description("Migrate from Firebase Realtime Database")
  .requiredOption("--service-account <path>", "Path to Firebase service account JSON key file")
  .requiredOption("--database-url <url>", "Firebase Realtime DB URL")
  .option("--output <path>", "Output file path", "./zerithdb-export.json")
  .option("--include <collections>", "Comma-separated collection names to include")
  .option("--exclude <collections>", "Comma-separated collection names to exclude")
  .option("--batch-size <n>", "Batch size for reads", "500")
  .action(async (opts) => {
    const serviceAccountKey = await loadJson(opts.serviceAccount);
    await runMigration(
      {
        type: "firebase-realtime",
        config: { serviceAccountKey, databaseURL: opts.databaseUrl },
      },
      opts
    );
  });

// ── firestore subcommand ──────────────────────────────────────────────────────

program
  .command("firestore")
  .description("Migrate from Google Cloud Firestore")
  .requiredOption("--service-account <path>", "Path to Firebase service account JSON key file")
  .requiredOption("--project-id <id>", "Firebase / GCP project ID")
  .option("--output <path>", "Output file path", "./zerithdb-export.json")
  .option("--include <collections>", "Comma-separated collection names to include")
  .option("--exclude <collections>", "Comma-separated collection names to exclude")
  .option("--batch-size <n>", "Batch size for reads", "500")
  .action(async (opts) => {
    const serviceAccountKey = await loadJson(opts.serviceAccount);
    await runMigration(
      {
        type: "firestore",
        config: { serviceAccountKey, projectId: opts.projectId },
      },
      opts
    );
  });

// ── supabase subcommand ───────────────────────────────────────────────────────

program
  .command("supabase")
  .description("Migrate from Supabase (PostgreSQL)")
  .requiredOption("--url <url>", "Supabase project URL")
  .requiredOption("--service-role-key <key>", "Supabase service role API key")
  .option("--tables <tables>", "Comma-separated table names to include")
  .option("--output <path>", "Output file path", "./zerithdb-export.json")
  .option("--include <tables>", "Comma-separated table names to include")
  .option("--exclude <tables>", "Comma-separated table names to exclude")
  .option("--batch-size <n>", "Batch size for paginated reads", "1000")
  .action(async (opts) => {
    await runMigration(
      {
        type: "supabase",
        config: {
          url: opts.url,
          serviceRoleKey: opts.serviceRoleKey,
          tables: opts.tables ? opts.tables.split(",").map((t: string) => t.trim()) : undefined,
        },
      },
      opts
    );
  });

program.parse();

// ── Shared runner ─────────────────────────────────────────────────────────────

async function runMigration(
  source: Parameters<typeof migrate>[0],
  opts: {
    output?: string;
    include?: string;
    exclude?: string;
    batchSize?: string;
  }
) {
  console.log("");
  console.log(chalk.bold.cyan("  ╔══════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("  ║    ZerithDB Migration Tool  v0.1.0   ║"));
  console.log(chalk.bold.cyan("  ╚══════════════════════════════════════╝"));
  console.log("");

  const spinner = ora({
    text: chalk.dim("Initialising connection…"),
    color: "cyan",
  }).start();

  // Per-collection progress bars
  const multiBar = new cliProgress.MultiBar(
    {
      clearOnComplete: false,
      hideCursor: true,
      format:
        chalk.cyan("  {collection}") +
        " │{bar}│ " +
        chalk.yellow("{value}/{total}") +
        " docs  {percentage}%  {duration_formatted}",
    },
    cliProgress.Presets.shades_grey
  );

  const bars = new Map<string, cliProgress.SingleBar>();
  const warnings: string[] = [];
  let started = false;

  function onProgress(p: MigrationProgress) {
    if (!started) {
      spinner.succeed(chalk.green("Connection established"));
      started = true;
    }

    if (p.warning) {
      warnings.push(`${chalk.yellow("⚠")}  [${p.collection}] ${p.warning}`);
    }

    if (!bars.has(p.collection)) {
      const bar = multiBar.create(Math.max(p.total, 1), 0, {
        collection: p.collection.padEnd(24).slice(0, 24),
      });
      bars.set(p.collection, bar);
    }

    const bar = bars.get(p.collection)!;
    if (p.total > 0) bar.setTotal(p.total);
    bar.update(p.processed);
  }

  try {
    const result = await migrate(source, {
      ...(opts.output ? { outputPath: opts.output } : {}),
      ...(opts.include ? { include: opts.include.split(",").map((s) => s.trim()) } : {}),
      ...(opts.exclude ? { exclude: opts.exclude.split(",").map((s) => s.trim()) } : {}),
      ...(opts.batchSize ? { batchSize: parseInt(opts.batchSize, 10) } : {}),
      onProgress,
    });

    multiBar.stop();
    console.log("");

    // ── Summary ─────────────────────────────────────────────────────────────

    console.log(chalk.bold("  Migration complete 🎉"));
    console.log("");
    console.log(`  ${chalk.dim("Source:")}      ${chalk.white(result.adapter)}`);
    console.log(`  ${chalk.dim("Collections:")} ${chalk.white(result.totalCollections)}`);
    console.log(
      `  ${chalk.dim("Documents:")}   ${chalk.white(result.totalDocuments.toLocaleString())}`
    );
    console.log(`  ${chalk.dim("Duration:")}    ${chalk.white(formatDuration(result.durationMs))}`);
    console.log(`  ${chalk.dim("Output:")}      ${chalk.cyan(result.outputPath)}`);
    console.log("");

    if (warnings.length > 0) {
      console.log(chalk.yellow(`  ${warnings.length} warning(s):`));
      for (const w of warnings.slice(0, 20)) {
        console.log(`    ${w}`);
      }
      if (warnings.length > 20) {
        console.log(chalk.dim(`    … and ${warnings.length - 20} more (check logs)`));
      }
      console.log("");
    }

    console.log(
      chalk.dim("  Import into ZerithDB with:") +
        chalk.cyan("\n  npx zerithdb import ") +
        chalk.white(result.outputPath)
    );
    console.log("");
  } catch (err) {
    multiBar.stop();
    spinner.fail(chalk.red("Migration failed"));
    console.error("");
    console.error(chalk.red(`  Error: ${(err as Error).message}`));
    if ((err as Error).stack) {
      console.error(chalk.dim((err as Error).stack));
    }
    process.exit(1);
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function loadJson(filePath: string): Promise<object> {
  try {
    const raw = await readFile(resolve(filePath), "utf-8");
    return JSON.parse(raw);
  } catch {
    console.error(chalk.red(`  Could not read JSON file: ${filePath}`));
    process.exit(1);
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
