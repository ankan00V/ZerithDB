import { describe, it, expect } from "vitest";
import { scan } from "../scanner.js";

describe("scanner", () => {
  it("scans primitives correctly", () => {
    expect(scan("hello").rootType).toBe("string");
    expect(scan(123).rootType).toBe("number");
    expect(scan(true).rootType).toBe("boolean");
    expect(scan(null).rootType).toBe("null");
  });

  it("scans objects correctly", () => {
    const meta = scan({ a: 1, b: "two" });
    expect(meta.rootType).toBe("object");
    expect(meta.fields).toBeDefined();
    expect(meta.fields["a"].types.has("number")).toBe(true);
    expect(meta.fields["b"].types.has("string")).toBe(true);
    expect(meta.fields["a"].count).toBe(1);
  });

  it("scans arrays of primitives", () => {
    const meta = scan([1, "two", null]);
    expect(meta.rootType).toBe("array");
    expect(meta.arrayTypes).toBeDefined();
    expect(meta.arrayTypes!.types.has("number")).toBe(true);
    expect(meta.arrayTypes!.types.has("string")).toBe(true);
    expect(meta.arrayTypes!.types.has("null")).toBe(true);
  });

  it("scans arrays of objects and tracks object count", () => {
    const meta = scan([{ a: 1 }, { a: 2, b: 3 }]);
    expect(meta.rootType).toBe("array");
    expect(meta.arrayTypes!.objectCount).toBe(2);

    const objFields = meta.arrayTypes!.objectFields!;
    expect(objFields["a"].count).toBe(2);
    expect(objFields["a"].types.has("number")).toBe(true);

    expect(objFields["b"].count).toBe(1);
    expect(objFields["b"].types.has("number")).toBe(true);
  });

  it("scans nested objects", () => {
    const meta = scan({ nested: { foo: "bar" } });
    const nestedMeta = meta.fields["nested"];
    expect(nestedMeta.types.has("object")).toBe(true);
    expect(nestedMeta.objectFields!["foo"].types.has("string")).toBe(true);
  });
});
