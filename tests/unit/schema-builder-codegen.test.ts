import { describe, expect, it } from "vitest";
import { generateSchemaArtifacts } from "../../apps/web/src/lib/schema-builder/codegen";
import type { SchemaEdge, SchemaNode } from "../../apps/web/src/lib/schema-builder/types";

describe("schema-builder codegen (MVP)", () => {
  it("generates zod schemas + inferred types", () => {
    const nodes: SchemaNode[] = [
      {
        id: "n1",
        name: "todos",
        x: 0,
        y: 0,
        fields: [
          { id: "f1", name: "text", kind: "string", required: true, array: false },
          { id: "f2", name: "done", kind: "boolean", required: false, array: false },
        ],
      },
    ];
    const edges: SchemaEdge[] = [];

    const out = generateSchemaArtifacts(nodes, edges).typescript;
    expect(out).toContain('import { z } from "zod";');
    expect(out).toContain("export const TodosSchema = z.object({");
    expect(out).toContain('"text": z.string(),');
    expect(out).toContain('"done": z.boolean().optional(),');
    expect(out).toContain("export type Todos = z.infer<typeof TodosSchema>;");
  });

  it("preserves field names as-is in schema keys", () => {
    const nodes: SchemaNode[] = [
      {
        id: "n1",
        name: "users",
        x: 0,
        y: 0,
        fields: [{ id: "f1", name: "user-id", kind: "string", required: true, array: false }],
      },
    ];
    const out = generateSchemaArtifacts(nodes, []).typescript;
    expect(out).toContain('"user-id": z.string(),');
    expect(out).not.toContain('"user_id": z.string(),');
  });

  it("emits custom type expressions without identifier sanitization", () => {
    const nodes: SchemaNode[] = [
      {
        id: "n1",
        name: "events",
        x: 0,
        y: 0,
        fields: [
          {
            id: "f1",
            name: "meta",
            kind: "custom",
            customType: "Record<string, unknown>",
            required: true,
            array: false,
          },
        ],
      },
    ];
    const out = generateSchemaArtifacts(nodes, []).typescript;
    expect(out).toContain("z.custom<Record<string, unknown>>()");
  });

  it("emits relation entries by collection name", () => {
    const nodes: SchemaNode[] = [
      { id: "a", name: "users", x: 0, y: 0, fields: [] },
      { id: "b", name: "posts", x: 0, y: 0, fields: [] },
    ];
    const edges: SchemaEdge[] = [{ id: "e1", from: "a", to: "b", label: "authorOf" }];

    const out = generateSchemaArtifacts(nodes, edges).typescript;
    expect(out).toContain('{ from: "users", to: "posts", label: "authorOf" }');
  });
});
