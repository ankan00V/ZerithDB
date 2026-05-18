import { describe, it, expect } from "vitest";
import { scan } from "../scanner.js";
import { inferTypes } from "../type-inference.js";
import { generateTypeScript } from "../ts-generator.js";
import { generateZod } from "../zod-generator.js";

describe("generators", () => {
  it("generates valid typescript", () => {
    const raw = scan([{ id: 1, name: "test", age: null }, { id: 2 }]);
    const schema = inferTypes(raw);
    const tsCode = generateTypeScript(schema, { rootName: "User" });

    expect(tsCode).toContain("export interface UserItem {");
    expect(tsCode).toContain("id: number;");
    expect(tsCode).toContain("name?: string;");
    expect(tsCode).toContain("age?: unknown | null;");
    expect(tsCode).toContain("export type User = UserItem[];");
  });

  it("generates valid zod schema", () => {
    const raw = scan({ id: 1, nested: { foo: "bar" }, tags: ["a", "b"] });
    const schema = inferTypes(raw);
    const zodCode = generateZod(schema, { rootName: "Post" });

    expect(zodCode).toContain('import { z } from "zod";');
    expect(zodCode).toContain("export const PostNestedSchema = z.object({");
    expect(zodCode).toContain("foo: z.string(),");
    expect(zodCode).toContain("export const PostSchema = z.object({");
    expect(zodCode).toContain("id: z.number(),");
    expect(zodCode).toContain("nested: PostNestedSchema,");
    expect(zodCode).toContain("tags: z.array(z.string()),");
  });
});
