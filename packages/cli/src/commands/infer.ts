import { execa } from "execa";
import chalk from "chalk";
import ora from "ora";
import path from "node:path";
import fs from "node:fs/promises";
import {
  scan,
  inferTypes,
  inferRelationships,
  generateTypeScript,
  generateZod,
} from "../infer/index.js";
import { writeFile } from "../utils/writeFile.js";

export interface InferCommandOptions {
  out?: string;
  name?: string;
  zodOnly?: boolean;
  tsOnly?: boolean;
  pretty?: boolean;
}

export async function inferCommand(jsonPath: string, options: InferCommandOptions) {
  const targetPath = path.resolve(process.cwd(), jsonPath);
  const outDir = options.out ? path.resolve(process.cwd(), options.out) : path.dirname(targetPath);
  const schemaName = options.name || "InferredSchema";

  const spinner = ora(`Reading JSON from ${targetPath}...`).start();

  let fileContent: string;
  try {
    fileContent = await fs.readFile(targetPath, "utf-8");
  } catch (err: unknown) {
    spinner.fail(
      chalk.red(
        `Failed to read file at ${targetPath}: ${err instanceof Error ? err.message : String(err)}`
      )
    );
    process.exit(1);
  }

  let data: unknown;
  try {
    spinner.text = "Parsing JSON...";
    data = JSON.parse(fileContent);
  } catch (err: unknown) {
    spinner.fail(
      chalk.red(`Invalid JSON format: ${err instanceof Error ? err.message : String(err)}`)
    );
    process.exit(1);
  }

  try {
    spinner.text = "Scanning and inferring types...";
    const rawMeta = scan(data);
    const normalized = inferTypes(rawMeta);
    const withRelations = inferRelationships(normalized);

    const tsCode = generateTypeScript(withRelations, { rootName: schemaName });
    const zodCode = generateZod(withRelations, { rootName: schemaName });

    spinner.text = "Writing generated files...";

    const tsFileName = `${schemaName.toLowerCase()}.schema.ts`;
    const zodFileName = `${schemaName.toLowerCase()}.schema.zod.ts`;

    if (!options.zodOnly) {
      await writeFile(outDir, tsFileName, tsCode);
    }

    if (!options.tsOnly) {
      await writeFile(outDir, zodFileName, zodCode);
    }

    spinner.succeed(chalk.green(`Inference complete! Output saved to ${outDir}`));

    if (options.pretty) {
      const filesToFormat = [];
      if (!options.zodOnly) filesToFormat.push(path.join(outDir, tsFileName));
      if (!options.tsOnly) filesToFormat.push(path.join(outDir, zodFileName));

      const formatSpinner = ora("Formatting outputs...").start();
      try {
        await execa("npx", ["prettier", "--write", ...filesToFormat]);
        formatSpinner.succeed(chalk.green("Outputs formatted successfully."));
      } catch {
        formatSpinner.warn(
          chalk.yellow("Prettier formatting failed or prettier is not installed.")
        );
      }
    }
  } catch (err: unknown) {
    spinner.fail(chalk.red("Failed to infer schema."));
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
