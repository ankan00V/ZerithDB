import chalk from "chalk";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export async function purgeCommand(): Promise<void> {
  try {
    const zerithPath = path.join(os.homedir(), ".zerithdb");

    if (fs.existsSync(zerithPath)) {
      fs.rmSync(zerithPath, {
        recursive: true,
        force: true,
      });

      console.log(chalk.green("✅ Successfully purged all local ZerithDB data."));
    } else {
      console.log(chalk.yellow("ℹ️ No local ZerithDB data found to purge."));
    }
  } catch (error) {
    console.error(chalk.red("❌ Failed to purge local ZerithDB data."));

    console.error(error);
    process.exit(1);
  }
}
