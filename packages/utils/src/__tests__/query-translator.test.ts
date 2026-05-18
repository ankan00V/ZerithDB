import { describe, it, expect } from "vitest";
import { translateNaturalQuery, parseOfflineNaturalQuery } from "../index.js";

describe("Query Translation Heuristics Engine", () => {
  it("should parse direct boolean flags", () => {
    const resActive = parseOfflineNaturalQuery("find active users");
    expect(resActive).toEqual({ active: true });

    const resInactive = parseOfflineNaturalQuery("find inactive tasks");
    expect(resInactive).toEqual({ active: false });

    const resCompleted = parseOfflineNaturalQuery("find completed items");
    expect(resCompleted).toEqual({ completed: true });

    const resIncomplete = parseOfflineNaturalQuery("find not completed and incomplete items");
    expect(resIncomplete).toEqual({ completed: false });
  });

  it("should parse numerical comparison operators", () => {
    const resGt = parseOfflineNaturalQuery("find items where price is greater than 100");
    expect(resGt).toEqual({ price: { $gt: 100 } });

    const resLte = parseOfflineNaturalQuery("find users with age <= 25");
    expect(resLte).toEqual({ age: { $lte: 25 } });

    const resLt = parseOfflineNaturalQuery("find users with age is under 30");
    expect(resLt).toEqual({ age: { $lt: 30 } });
  });

  it("should parse equality and string operators", () => {
    const resEq = parseOfflineNaturalQuery("find tasks with priority is high");
    expect(resEq).toEqual({ priority: "high" });

    const resNe = parseOfflineNaturalQuery("find members with status is not banned");
    expect(resNe).toEqual({ status: { $ne: "banned" } });

    const resRegex = parseOfflineNaturalQuery("find articles where title contains local-first");
    expect(resRegex).toEqual({ title: { $regex: "local-first" } });
  });

  it("should support custom schema type casting", () => {
    const schema = {
      price: "number" as const,
      active: "boolean" as const,
      title: "string" as const,
    };

    const res = parseOfflineNaturalQuery(
      "find products where price is greater than 19.99 and active is true",
      schema
    );
    expect(res).toEqual({
      price: { $gt: 19.99 },
      active: true,
    });
  });

  it("should parse 'in' list collections", () => {
    const resIn = parseOfflineNaturalQuery("find tasks where priority is in [high, medium]");
    expect(resIn).toEqual({ priority: { $in: ["high", "medium"] } });
  });
});

describe("Pipeline translateNaturalQuery Function", () => {
  it("should successfully fall back to offline parsing when cloud provider is unreachable", async () => {
    const res = await translateNaturalQuery("find pending tasks with priority is high", {
      provider: "openai",
      apiKey: "unreachable-key",
    });

    expect(res).toEqual({
      status: "pending",
      priority: "high",
    });
  });

  it("should throw an error if prompt is empty or invalid", async () => {
    await expect(translateNaturalQuery("")).rejects.toThrow();
    await expect(translateNaturalQuery(null as any)).rejects.toThrow();
    await expect(translateNaturalQuery(undefined as any)).rejects.toThrow();
  });

  it("should reject with SDK config error if invalid provider is requested", async () => {
    await expect(
      translateNaturalQuery("find something", { provider: "invalid-provider" as any })
    ).rejects.toThrow(/Invalid query translation provider/);
  });
});

describe("Query Translation Edge Cases and Hardening", () => {
  it("should safely return empty filter for null, undefined, or empty query", () => {
    expect(parseOfflineNaturalQuery(null as any)).toEqual({});
    expect(parseOfflineNaturalQuery(undefined as any)).toEqual({});
    expect(parseOfflineNaturalQuery("")).toEqual({});
    expect(parseOfflineNaturalQuery("   ")).toEqual({});
  });

  it("should gracefully cast values if schema context is missing or field is unconfigured", () => {
    const resNoSchema = parseOfflineNaturalQuery("age is 21");
    expect(resNoSchema).toEqual({ age: 21 }); // auto-heuristics casting

    const resUnconfiguredField = parseOfflineNaturalQuery("age is 25 and status is active", {
      status: "boolean" as const,
    });
    expect(resUnconfiguredField).toEqual({ age: 25, active: true, status: true }); // mixed schema + heuristics
  });

  it("should validate and throw for invalid options configurations in translateNaturalQuery", async () => {
    // Non-object options
    await expect(translateNaturalQuery("find items", "invalid-options" as any)).rejects.toThrow();

    // OpenAI provider without API Key
    await expect(translateNaturalQuery("find items", { provider: "openai" })).rejects.toThrow(
      /API Key is required/
    );
  });

  it("should honor explicit string schema casting and not fallback to auto-heuristics", () => {
    // Without schema: auto-casts to number
    const resNoSchema = parseOfflineNaturalQuery("code is 123");
    expect(resNoSchema).toEqual({ code: 123 });

    // With explicit string schema: preserves string type
    const schema = { code: "string" as const };
    const resWithSchema = parseOfflineNaturalQuery("code is 123", schema);
    expect(resWithSchema).toEqual({ code: "123" });
  });

  it("should not cast numeric strings with leading zeros using auto-heuristics", () => {
    // Values with leading zeros (e.g., zip codes, phone numbers, identifiers)
    const resLeadingZeros = parseOfflineNaturalQuery("zipcode is 08540 and phone is 012345");
    expect(resLeadingZeros).toEqual({ zipcode: "08540", phone: "012345" });

    // Single zero should still be cast to number 0
    const resSingleZero = parseOfflineNaturalQuery("price is 0");
    expect(resSingleZero).toEqual({ price: 0 });
  });

  it("should handle invalid schemaContext gracefully without throwing runtime errors", () => {
    const resInvalidSchema1 = parseOfflineNaturalQuery("age is 21", null as any);
    expect(resInvalidSchema1).toEqual({ age: 21 });

    const resInvalidSchema2 = parseOfflineNaturalQuery("age is 21", "invalid" as any);
    expect(resInvalidSchema2).toEqual({ age: 21 });

    const resInvalidSchema3 = parseOfflineNaturalQuery("age is 21", [] as any);
    expect(resInvalidSchema3).toEqual({ age: 21 });
  });
});
