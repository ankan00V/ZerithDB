import { describe, it, expect } from "vitest";
import { generateLocalMockData } from "../commands/generate.js";

describe("Semantic AI Mock Data Generator", () => {
  it("should generate mock records matching a flat schema structure", () => {
    const schema = {
      id: "string",
      email: "string",
      age: "number",
      active: "boolean",
    };

    const count = 5;
    const records = generateLocalMockData(schema, count, "user profiles");

    expect(records).toHaveLength(count);

    for (const record of records) {
      expect(record.id).toBeDefined();
      expect(typeof record.id).toBe("string");

      expect(record.email).toBeDefined();
      expect(record.email).toContain("@example.com");

      expect(record.age).toBeDefined();
      expect(typeof record.age).toBe("number");

      expect(record.active).toBeDefined();
      expect(typeof record.active).toBe("boolean");
    }
  });

  it("should generate semantically accurate task records", () => {
    const schema = {
      id: "string",
      title: "string",
      priority: "string",
      completed: "boolean",
    };

    const count = 3;
    const records = generateLocalMockData(schema, count, "generate 3 tasks");

    expect(records).toHaveLength(count);

    // Check first record has task-like title and priority
    const first = records[0];
    expect(first.title).toBeDefined();
    expect(typeof first.title).toBe("string");

    expect(first.priority).toBeDefined();
    expect(["low", "medium", "high"]).toContain(first.priority);
  });

  it("should fall back to standard primitives for unrecognized fields", () => {
    const schema = {
      id: "string",
      customSecretKeyField: "string",
      customScoreValueField: "number",
      customFlagField: "boolean",
    };

    const count = 2;
    const records = generateLocalMockData(schema, count, "general database seeder");

    expect(records).toHaveLength(count);

    for (const record of records) {
      expect(record.customSecretKeyField).toBeDefined();
      expect(record.customSecretKeyField).toContain("mock-customSecretKeyField");

      expect(record.customScoreValueField).toBeDefined();
      expect(typeof record.customScoreValueField).toBe("number");

      expect(record.customFlagField).toBeDefined();
      expect(typeof record.customFlagField).toBe("boolean");
    }
  });
});
