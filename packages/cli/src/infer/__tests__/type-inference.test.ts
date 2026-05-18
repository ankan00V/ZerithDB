import { describe, it, expect } from "vitest";
import { scan } from "../scanner.js";
import { inferTypes } from "../type-inference.js";

describe("type-inference", () => {
  it("infers optional fields correctly", () => {
    const raw = scan([{ a: 1 }, { a: 2, b: 3 }]);
    const schema = inferTypes(raw);

    expect(schema.rootType).toBe("array");
    const fields = schema.arrayItem!.objectSchema!;

    expect(fields["a"].isOptional).toBe(false);
    expect(fields["b"].isOptional).toBe(true);
  });

  it("infers nullable fields correctly", () => {
    const raw = scan([{ a: 1 }, { a: null }]);
    const schema = inferTypes(raw);

    const fields = schema.arrayItem!.objectSchema!;
    expect(fields["a"].isNullable).toBe(true);
    expect(fields["a"].types).toEqual(["number"]);
  });

  it("handles empty arrays", () => {
    const raw = scan([]);
    const schema = inferTypes(raw);

    expect(schema.rootType).toBe("array");
    expect(schema.arrayItem!.types).toEqual(["unknown"]);
  });

  it("handles arrays with mixed types", () => {
    const raw = scan([1, "two"]);
    const schema = inferTypes(raw);

    expect(schema.arrayItem!.types).toContain("number");
    expect(schema.arrayItem!.types).toContain("string");
  });

  it("normalizes root objects", () => {
    const raw = scan({ id: 1, name: null });
    const schema = inferTypes(raw);

    expect(schema.rootType).toBe("object");
    expect(schema.fields["id"].isOptional).toBe(false);
    expect(schema.fields["id"].isNullable).toBe(false);
    expect(schema.fields["name"].isOptional).toBe(false);
    expect(schema.fields["name"].isNullable).toBe(true);
  });
});
