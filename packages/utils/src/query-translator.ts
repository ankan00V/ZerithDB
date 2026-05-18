import { ZerithDBError, ErrorCode } from "zerithdb-errors";

/**
 * Strategy/provider for translating natural language queries to ZerithDB filters.
 */
export type QueryTranslationProvider = "local" | "ollama" | "openai";

/**
 * Options to configure the natural language to query translation pipeline.
 */
export interface QueryTranslatorOptions {
  /**
   * The translation provider strategy: 'local' (offline heuristics), 'ollama' (local LLM), or 'openai' (cloud LLMs).
   * Defaults to 'local'.
   */
  provider?: QueryTranslationProvider;

  /**
   * API Key for cloud providers (e.g., OpenAI, Groq, Anthropic-compatible endpoints).
   */
  apiKey?: string;

  /**
   * Custom endpoint URL for the translation provider (e.g., http://localhost:11434 for Ollama, https://api.openai.com/v1 for OpenAI).
   */
  endpoint?: string;

  /**
   * The specific LLM model to use (e.g., 'llama3' or 'mistral' for Ollama, 'gpt-4o' or 'gpt-3.5-turbo' for OpenAI).
   */
  model?: string;

  /**
   * Optional schema context specifying fields and their expected primitive types ('string' | 'number' | 'boolean').
   * Helps cast parsed values to the correct types during offline heuristics matching.
   */
  schemaContext?: Record<string, "string" | "number" | "boolean">;
}

/**
 * Offline Heuristic Query Parser.
 * Uses robust tokenization and syntax pattern matching to parse query intents
 * into valid ZerithDB query filters completely offline.
 *
 * @param prompt - Natural language query input. Safe against null, undefined, or empty queries.
 * @param schemaContext - Optional type mapping schema shape definitions.
 * @returns A structured MongoDB-like filter object.
 */
export function parseOfflineNaturalQuery(
  prompt: string,
  schemaContext?: Record<string, "string" | "number" | "boolean">
): Record<string, any> {
  const filter: Record<string, any> = {};

  // 1. Guard and validate input values against edge cases
  if (
    prompt === null ||
    prompt === undefined ||
    typeof prompt !== "string" ||
    prompt.trim() === ""
  ) {
    return filter;
  }

  const lowercasedPrompt = prompt.toLowerCase().trim();

  // 2. Direct short-circuits for common status/boolean patterns
  if (lowercasedPrompt.includes("active")) {
    filter.active = true;
  }
  if (lowercasedPrompt.includes("inactive")) {
    filter.active = false;
  }
  if (lowercasedPrompt.includes("completed") || lowercasedPrompt.includes("done")) {
    if (
      lowercasedPrompt.includes("not completed") ||
      lowercasedPrompt.includes("incomplete") ||
      lowercasedPrompt.includes("undone")
    ) {
      filter.completed = false;
    } else {
      filter.completed = true;
    }
  }
  if (lowercasedPrompt.includes("pending")) {
    filter.status = "pending";
  }

  // Strip standard introductory search prefixes so they don't get matched as field names
  const normalizedPrompt = lowercasedPrompt
    .replace(
      /^\b(?:find|search|get|show|query|list|select|items|users|products|tasks|members|notes|articles|where|with)\b/gi,
      ""
    )
    .trim();

  // 3. Split clauses by common logical boundary tokens (and, with, where, comma - ignoring commas inside brackets)
  const clauses = normalizedPrompt
    .replace(/\bwhere\b/g, "&&")
    .replace(/\bwith\b/g, "&&")
    .replace(/\band\b/g, "&&")
    .split(/(?:&&|,\s*(?![^\[]*\]))/)
    .map((c) => c.trim())
    .filter(Boolean);

  for (const clause of clauses) {
    // Look for operators

    // a. "greater than or equal to" or ">="
    const gteMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:>=|\bis greater than or equal to\b|\bis at least\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (gteMatch) {
      const [, field, rawVal] = gteMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $gte: castValue(field, rawVal, schemaContext) };
        continue;
      }
    }

    // b. "less than or equal to" or "<="
    const lteMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:<=|\bis less than or equal to\b|\bis at most\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (lteMatch) {
      const [, field, rawVal] = lteMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $lte: castValue(field, rawVal, schemaContext) };
        continue;
      }
    }

    // c. "greater than" or ">"
    const gtMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:>|\bis greater than\b|\bis more than\b|\bis above\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (gtMatch) {
      const [, field, rawVal] = gtMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $gt: castValue(field, rawVal, schemaContext) };
        continue;
      }
    }

    // d. "less than" or "<"
    const ltMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:<|\bis less than\b|\bis under\b|\bis below\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (ltMatch) {
      const [, field, rawVal] = ltMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $lt: castValue(field, rawVal, schemaContext) };
        continue;
      }
    }

    // e. "not equal to" or "is not" or "!="
    const neMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:!=|\bis not equal to\b|\bis not\b|\bnot equals?\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (neMatch) {
      const [, field, rawVal] = neMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $ne: castValue(field, rawVal, schemaContext) };
        continue;
      }
    }

    // f. "contains" or "includes" or "matches"
    const containsMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*\b(?:contains|includes|matches|has)\b\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (containsMatch) {
      const [, field, rawVal] = containsMatch;
      if (field && rawVal && field !== "is" && field !== "where") {
        filter[field] = { $regex: rawVal };
        continue;
      }
    }

    // g. "in list" or "any of"
    const inMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*\b(?:is in|any of|in)\b\s*\[?([a-zA-Z0-9._\s,$-]+)\]?/
    );
    if (inMatch) {
      const [, field, rawVals] = inMatch;
      if (field && rawVals && field !== "is" && field !== "where" && field !== "in") {
        const list = rawVals
          .split(",")
          .map((v) => castValue(field, v.trim().replace(/['"]/g, ""), schemaContext));
        filter[field] = { $in: list };
        continue;
      }
    }

    // h. Standard equality: "equals", "is", or "="
    const eqMatch = clause.match(
      /([a-zA-Z0-9_$]+)\s*(?:=|\bequals?\b|\bis\b)\s*['"]?([a-zA-Z0-9._$-]+)['"]?/
    );
    if (eqMatch) {
      const [, field, rawVal] = eqMatch;
      if (
        field &&
        rawVal &&
        field !== "is" &&
        field !== "where" &&
        field !== "not" &&
        field !== "in"
      ) {
        filter[field] = castValue(field, rawVal, schemaContext);
        continue;
      }
    }
  }

  return filter;
}

/**
 * Casts a string value parsed from a prompt to the correct primitive type.
 *
 * @param field - Object property field name.
 * @param val - Extracted string value.
 * @param schemaContext - Optional schema dictionary representing known types.
 */
function castValue(
  field: string,
  val: string,
  schemaContext?: Record<string, "string" | "number" | "boolean">
): string | number | boolean {
  if (val === null || val === undefined) {
    return "";
  }

  // Gracefully handle undefined or invalid schemaContext
  const hasValidSchema =
    schemaContext && typeof schemaContext === "object" && !Array.isArray(schemaContext);
  const type = hasValidSchema ? schemaContext[field] : undefined;

  if (type === "string") {
    return val;
  }

  if (type === "number") {
    const num = Number(val);
    return isNaN(num) ? val : num;
  }

  if (type === "boolean") {
    return val === "true" || val === "yes" || val === "1" || val === "active";
  }

  // Auto-heuristics fallback if type is unknown or no schemaContext is supplied
  if (val === "true" || val === "false") {
    return val === "true";
  }

  const trimmed = val.trim();
  const num = Number(trimmed);
  if (!isNaN(num) && trimmed !== "" && Number.isFinite(num)) {
    // Avoid casting phone numbers, zip codes with leading zeros (except single "0")
    if (trimmed.length === 1 || !trimmed.startsWith("0")) {
      return num;
    }
  }

  return val;
}

/**
 * Premium Query Translation Pipeline.
 * Instructs local/cloud LLMs or our local heuristics engine to translate
 * user natural language instructions into fully valid ZerithDB query filters.
 *
 * @param prompt - Natural language query (e.g. "find products under 50 dollars with status active")
 * @param options - Pipeline configuration options (provider, endpoint, apiKey, model, schema)
 * @returns A promise resolving to a valid ZerithDB JSON query filter
 */
export async function translateNaturalQuery(
  prompt: string,
  options?: QueryTranslatorOptions
): Promise<Record<string, any>> {
  // Input Validation
  if (
    prompt === null ||
    prompt === undefined ||
    typeof prompt !== "string" ||
    prompt.trim() === ""
  ) {
    throw new ZerithDBError(
      ErrorCode.SDK_INVALID_CONFIG,
      "Prompt must be a non-empty natural language string"
    );
  }

  // Options Validation
  if (options !== undefined && options !== null) {
    if (typeof options !== "object" || Array.isArray(options)) {
      throw new ZerithDBError(
        ErrorCode.SDK_INVALID_CONFIG,
        "Options must be a valid configuration object"
      );
    }

    if (options.provider && !["local", "ollama", "openai"].includes(options.provider)) {
      throw new ZerithDBError(
        ErrorCode.SDK_INVALID_CONFIG,
        `Invalid query translation provider: '${options.provider}'. Must be 'local', 'ollama', or 'openai'.`
      );
    }

    if (options.provider === "openai" && !options.apiKey) {
      throw new ZerithDBError(
        ErrorCode.SDK_INVALID_CONFIG,
        "API Key is required for OpenAI query translation provider"
      );
    }
  }

  const validatedOptions = options || {};
  const provider = validatedOptions.provider || "local";

  if (provider === "ollama") {
    const endpoint = validatedOptions.endpoint || "http://localhost:11434";
    const model = validatedOptions.model || "llama3";

    try {
      const systemPrompt = `You are a strict query translation engine. Your task is to translate this natural language instruction into a valid MongoDB-like ZerithDB query filter: "${prompt}".
ZerithDB supports:
- Equality: { field: value }
- Operators: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists, $regex.

Target schema properties: ${validatedOptions.schemaContext ? JSON.stringify(validatedOptions.schemaContext) : "any fields mentioned in the prompt"}.
Your output MUST be a single valid JSON object. Do not include markdown code formatting blocks, do not explain your response, do not include any other text. Only return the raw JSON object.`;

      const response = await fetch(`${endpoint}/api/generate`, {
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
        throw new Error(`HTTP ${response.status}`);
      }

      const body = (await response.json()) as { response: string };
      const parsed = JSON.parse(body.response.trim());
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
      throw new Error("Ollama returned an invalid non-object format");
    } catch (err: any) {
      console.warn(
        `[QueryTranslator] Ollama failed: ${err.message}. Falling back to offline heuristics.`
      );
      return parseOfflineNaturalQuery(prompt, validatedOptions.schemaContext);
    }
  }

  if (provider === "openai") {
    const endpoint = validatedOptions.endpoint || "https://api.openai.com/v1";
    const model = validatedOptions.model || "gpt-3.5-turbo";
    const apiKey = validatedOptions.apiKey;

    // Redundant guard since options validation catches this, but kept for absolute safety
    if (!apiKey) {
      throw new ZerithDBError(
        ErrorCode.SDK_INVALID_CONFIG,
        "API Key is required for OpenAI query translation provider"
      );
    }

    try {
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: `You translate natural language to a MongoDB-like ZerithDB JSON query filter. Only return the valid JSON object. Do not wrap in markdown or explain. Support $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists, $regex. Schema shape context: ${
                validatedOptions.schemaContext
                  ? JSON.stringify(validatedOptions.schemaContext)
                  : "implicit"
              }`,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          response_format: { type: "json_object" },
          temperature: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.trim());
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed;
        }
      }
      throw new Error("Invalid response payload from OpenAI API");
    } catch (err: any) {
      console.warn(
        `[QueryTranslator] OpenAI connection failed: ${err.message}. Falling back to offline heuristics.`
      );
      return parseOfflineNaturalQuery(prompt, validatedOptions.schemaContext);
    }
  }

  // Fallback / default to local offline heuristics translation
  return parseOfflineNaturalQuery(prompt, validatedOptions.schemaContext);
}
