import chalk from "chalk";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { randomUUID } from "node:crypto";

interface GenerateOptions {
  prompt?: string;
  count?: string;
  schema?: string;
  output?: string;
  provider?: string;
  model?: string;
}

// Built-in lists of realistic semantic mock values
const MOCK_NAMES = [
  "Arpit Khandelwal",
  "Vikas Kumar",
  "Adya Archita",
  "John Doe",
  "Jane Smith",
  "Alice Johnson",
  "Bob Miller",
  "Sarah Connor",
  "Emily Watson",
  "David Davis",
  "Michael Chen",
  "Sophia Rodriguez",
  "Liam O'Connor",
  "Aria Patel",
  "Omar Farooq",
];

const MOCK_CATEGORIES = [
  "Electronics",
  "Office Supplies",
  "Apparel",
  "Home & Kitchen",
  "Fitness",
  "Books",
];

const MOCK_LOG_SERVICES = [
  "auth-service",
  "db-driver",
  "gateway-api",
  "sync-worker",
  "indexing-engine",
];

const MOCK_LOG_MESSAGES = [
  "Connection established to local peer",
  "Sync replication sync completed in 42ms",
  "Scheduled asynchronous fractional index rebalance",
  "Token authentication validation success",
  "Cache miss on query filters, fetching from IndexedDB",
];

const MOCK_PRIORITIES = ["low", "medium", "high"];
const MOCK_STATUSES = [
  "pending",
  "completed",
  "shipped",
  "cancelled",
  "active",
  "inactive",
  "todo",
  "in_progress",
  "done",
];

const MOCK_PRODUCT_TITLES = [
  "Premium Mechanical Keyboard",
  "UltraWide 4K Monitor",
  "Wireless Ergonomic Mouse",
  "USB-C Multiport Adapter",
  "Noise Cancelling Headphones",
  "Portable SSD 1TB",
  "Dual-Screen Desk Stand",
  "Leather Executive Chair",
  "Smart Water Bottle",
];

const MOCK_TASK_TITLES = [
  "Implement Fractional Indexing",
  "Fix Typecheck Pipeline",
  "Design Neon SVG Charts",
  "Setup Offline AI Seeder",
  "Write Integration Tests",
  "Review Pull Requests",
  "Optimize Local DB Seeding",
  "Integrate Event Emitter Sync",
  "Refactor Auth0 Wrapper",
];

const MOCK_DESCRIPTIONS = [
  "A highly reliable, local-first IndexedDB storage driver with real-time replication.",
  "An explainable Natural Language dashboard interface connected to ZerithDB.",
  "A string-based collaborative list reordering CRDT implementing Figma's midpoint algorithm.",
  "High-performance local development setup with WebSocket synchronization capabilities.",
];

/**
 * Robust Local Semantic Engine that generates realistic mock data based on field keys
 */
export function generateLocalMockData(
  schema: Record<string, string>,
  count: number,
  promptContext: string
): any[] {
  const isTask =
    promptContext.includes("task") ||
    promptContext.includes("todo") ||
    schema["title"]?.includes("task") ||
    schema["title"]?.includes("todo");
  const isProduct =
    promptContext.includes("product") ||
    promptContext.includes("item") ||
    promptContext.includes("ecommerce");

  const results: any[] = [];

  for (let i = 0; i < count; i++) {
    const record: Record<string, any> = {};

    for (const [key, type] of Object.entries(schema)) {
      const lowerKey = key.toLowerCase();

      // IDs
      if (lowerKey === "id" || lowerKey === "_id" || lowerKey === "uuid") {
        record[key] =
          typeof randomUUID === "function"
            ? randomUUID()
            : `mock-uuid-${Math.random().toString(36).substring(2, 11)}`;
        continue;
      }

      // Semantic Field Rules
      if (lowerKey.includes("email")) {
        const namePart = MOCK_NAMES[i % MOCK_NAMES.length]?.toLowerCase().replace(/\s+/g, ".");
        record[key] = `${namePart}${i + 1}@example.com`;
      } else if (lowerKey.includes("first") && lowerKey.includes("name")) {
        record[key] = MOCK_NAMES[i % MOCK_NAMES.length]?.split(" ")[0] || "John";
      } else if (lowerKey.includes("last") && lowerKey.includes("name")) {
        record[key] = MOCK_NAMES[i % MOCK_NAMES.length]?.split(" ")[1] || "Doe";
      } else if (lowerKey.includes("name")) {
        if (isProduct) {
          record[key] = MOCK_PRODUCT_TITLES[i % MOCK_PRODUCT_TITLES.length];
        } else {
          record[key] = MOCK_NAMES[i % MOCK_NAMES.length];
        }
      } else if (lowerKey.includes("phone") || lowerKey.includes("mobile")) {
        record[key] = `+1 (555) ${100 + i}-${2000 + i}`;
      } else if (
        lowerKey.includes("price") ||
        lowerKey.includes("amount") ||
        lowerKey.includes("cost") ||
        lowerKey.includes("total")
      ) {
        record[key] = parseFloat((19.99 + i * 12.5 + (i % 3) * 4.25).toFixed(2));
      } else if (
        lowerKey.includes("quantity") ||
        lowerKey.includes("count") ||
        lowerKey.includes("stock") ||
        lowerKey.includes("age")
      ) {
        record[key] = 5 + i * 3 + (i % 4);
      } else if (lowerKey.includes("category")) {
        record[key] = MOCK_CATEGORIES[i % MOCK_CATEGORIES.length];
      } else if (lowerKey.includes("priority")) {
        record[key] = MOCK_PRIORITIES[i % MOCK_PRIORITIES.length];
      } else if (lowerKey.includes("status")) {
        if (isTask) {
          record[key] = i % 2 === 0 ? "todo" : "completed";
        } else if (isProduct) {
          record[key] = "active";
        } else {
          record[key] = MOCK_STATUSES[i % MOCK_STATUSES.length];
        }
      } else if (lowerKey.includes("title")) {
        if (isTask) {
          record[key] = MOCK_TASK_TITLES[i % MOCK_TASK_TITLES.length];
        } else {
          record[key] = MOCK_PRODUCT_TITLES[i % MOCK_PRODUCT_TITLES.length];
        }
      } else if (
        lowerKey.includes("description") ||
        lowerKey.includes("content") ||
        lowerKey.includes("body")
      ) {
        record[key] = MOCK_DESCRIPTIONS[i % MOCK_DESCRIPTIONS.length];
      } else if (lowerKey.includes("service")) {
        record[key] = MOCK_LOG_SERVICES[i % MOCK_LOG_SERVICES.length];
      } else if (lowerKey.includes("message")) {
        record[key] = MOCK_LOG_MESSAGES[i % MOCK_LOG_MESSAGES.length];
      } else if (
        lowerKey.includes("avatar") ||
        lowerKey.includes("image") ||
        lowerKey.includes("url") ||
        lowerKey.includes("photo")
      ) {
        record[key] = `https://api.dicebear.com/7.x/adventurer/svg?seed=user_${i + 1}`;
      } else if (
        lowerKey.includes("date") ||
        lowerKey.includes("created") ||
        lowerKey.includes("updated") ||
        lowerKey.includes("timestamp")
      ) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        record[key] = d.toISOString();
      } else if (
        lowerKey.includes("completed") ||
        lowerKey.includes("active") ||
        lowerKey.includes("admin") ||
        lowerKey.includes("verified")
      ) {
        record[key] = i % 2 === 0;
      } else {
        // Fallback based on type
        if (type === "number") {
          record[key] = i + 1;
        } else if (type === "boolean") {
          record[key] = i % 2 === 0;
        } else {
          record[key] = `mock-${key}-${i + 1}`;
        }
      }
    }
    results.push(record);
  }

  return results;
}

/**
 * Helper to infer schema properties from a TypeScript interface, Zod definition, or JSON file
 */
function inferSchema(schemaPath: string): Record<string, string> {
  const fullPath = path.resolve(schemaPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const content = fs.readFileSync(fullPath, "utf-8");

  // If JSON, parse directly
  if (schemaPath.endsWith(".json")) {
    try {
      const parsed = JSON.parse(content);
      const schema: Record<string, string> = {};

      // Handle standard JSON Schema properties mapping
      if (parsed.properties && typeof parsed.properties === "object") {
        for (const [key, val] of Object.entries(parsed.properties)) {
          const type =
            val && typeof val === "object" && "type" in val ? String(val.type) : "string";
          schema[key] = type;
        }
      } else {
        // Treat as flat JSON key-value templates
        for (const [key, val] of Object.entries(parsed)) {
          schema[key] = typeof val;
        }
      }
      return schema;
    } catch {
      throw new Error(`Failed to parse JSON schema at ${schemaPath}`);
    }
  }

  // TypeScript interface/type or Zod parser regex
  const schema: Record<string, string> = {};

  // Extract patterns like "email: string", "age?: number", "active: z.boolean()"
  const lines = content.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue;

    // TypeScript matching: fieldName: type
    const tsMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\??\s*:\s*([a-zA-Z|[\]]+)/);
    if (tsMatch && tsMatch[1] && tsMatch[2]) {
      const type = tsMatch[2].toLowerCase().includes("number")
        ? "number"
        : tsMatch[2].toLowerCase().includes("boolean")
          ? "boolean"
          : "string";
      schema[tsMatch[1]] = type;
      continue;
    }

    // Zod matching: fieldName: z.string()
    const zodMatch = trimmed.match(/^([a-zA-Z0-9_$]+)\s*:\s*z\.(string|number|boolean)/);
    if (zodMatch && zodMatch[1] && zodMatch[2]) {
      schema[zodMatch[1]] = zodMatch[2];
    }
  }

  if (Object.keys(schema).length === 0) {
    // If no keys matched, provide a basic fallback schema
    return {
      id: "string",
      name: "string",
      description: "string",
      status: "string",
      createdAt: "string",
    };
  }

  return schema;
}

/**
 * Standard Prompt Heuristics to build clean schemas out of standard domain prompts
 */
function getSchemaFromPrompt(prompt: string): Record<string, string> {
  const lower = prompt.toLowerCase();

  if (lower.includes("order") || lower.includes("ecommerce") || lower.includes("transaction")) {
    return {
      id: "string",
      orderNumber: "string",
      customerName: "string",
      itemsCount: "number",
      totalAmount: "number",
      status: "string",
      createdAt: "string",
    };
  }

  if (lower.includes("user") || lower.includes("profile") || lower.includes("member")) {
    return {
      id: "string",
      name: "string",
      email: "string",
      role: "string",
      active: "boolean",
      avatar: "string",
      createdAt: "string",
    };
  }

  if (lower.includes("todo") || lower.includes("task") || lower.includes("issue")) {
    return {
      id: "string",
      title: "string",
      description: "string",
      priority: "string",
      completed: "boolean",
      dueDate: "string",
    };
  }

  if (lower.includes("product") || lower.includes("item") || lower.includes("inventory")) {
    return {
      id: "string",
      name: "string",
      category: "string",
      price: "number",
      stock: "number",
      description: "string",
      image: "string",
    };
  }

  if (lower.includes("log") || lower.includes("event") || lower.includes("error")) {
    return {
      id: "string",
      timestamp: "string",
      level: "string",
      service: "string",
      message: "string",
      durationMs: "number",
    };
  }

  // General fallback
  return {
    id: "string",
    name: "string",
    description: "string",
    status: "string",
    createdAt: "string",
  };
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  const prompt = options.prompt || "Generate realistic developer mock logs";

  // Extract count from prompt if explicitly declared, else use flag option
  let count = 10;
  const promptCountMatch = prompt.match(/\b(\d+)\b/);
  if (promptCountMatch && promptCountMatch[1]) {
    count = parseInt(promptCountMatch[1], 10);
  } else if (options.count) {
    count = parseInt(options.count, 10);
  }

  const output = options.output || "./mock-data.json";
  const provider = options.provider || "local";
  const model = options.model || "llama3";

  console.log(chalk.cyan(`🤖 Initializing Semantic AI Data Generator...`));
  console.log(chalk.gray(`   Prompt:   "${prompt}"`));
  console.log(chalk.gray(`   Count:    ${count}`));
  console.log(chalk.gray(`   Provider: ${provider}`));

  let schema: Record<string, string>;
  if (options.schema) {
    try {
      schema = inferSchema(options.schema);
      console.log(chalk.green(`✅ Successfully parsed schema from ${options.schema}`));
    } catch (err: any) {
      console.error(chalk.red(`❌ Schema Error: ${err.message}`));
      process.exit(1);
    }
  } else {
    schema = getSchemaFromPrompt(prompt);
    console.log(chalk.blue(`💡 Inferred target fields: [${Object.keys(schema).join(", ")}]`));
  }

  let records: any[] = [];

  if (provider === "ollama") {
    try {
      console.log(
        chalk.yellow(`📡 Connecting to local Ollama instance at http://localhost:11434...`)
      );

      const systemPrompt = `You are a strict JSON data seeder. Generate exactly ${count} realistic mock data records based on this natural language request: "${prompt}".
Maintain this exact structural shape: ${JSON.stringify(schema)}.
Your response MUST be a valid JSON array of objects. Do not wrap your response in markdown backticks, do not write explanations, and do not include additional text. Only return the JSON.`;

      const response = await fetch("http://localhost:11434/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt: systemPrompt,
          stream: false,
          format: "json",
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const body = (await response.json()) as { response: string };
      records = JSON.parse(body.response.trim());
      console.log(
        chalk.green(
          `✅ Successfully generated ${records.length} records using local Ollama model ${model}.`
        )
      );
    } catch (err: any) {
      console.warn(chalk.yellow(`⚠️  Ollama generation failed or unreachable: ${err.message}`));
      console.log(
        chalk.blue(`⚙️  Falling back to high-fidelity built-in offline Semantic Engine...`)
      );
      records = generateLocalMockData(schema, count, prompt);
    }
  } else {
    records = generateLocalMockData(schema, count, prompt);
  }

  // Ensure record array limits match requested count
  if (records.length > count) {
    records = records.slice(0, count);
  }

  try {
    const targetDir = path.dirname(output);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    fs.writeFileSync(output, JSON.stringify(records, null, 2));

    console.log(chalk.green(`\n🎉 Mock data generation complete!`));
    console.log(chalk.cyan(`   Saved to:  ${path.resolve(output)}`));
    console.log(chalk.cyan(`   Records:   ${records.length}`));

    // Display preview of first record
    if (records[0]) {
      console.log(chalk.gray(`\n🔍 First record preview:`));
      console.log(chalk.yellow(JSON.stringify(records[0], null, 2)));
    }
  } catch (err: any) {
    console.error(chalk.red(`❌ Failed to save mock data: ${err.message}`));
    process.exit(1);
  }
}
