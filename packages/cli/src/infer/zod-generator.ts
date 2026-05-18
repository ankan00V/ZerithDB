import { NormalizedSchema, NormalizedField } from "./types.js";

export interface ZodGeneratorOptions {
  rootName?: string;
}

export function generateZod(schema: NormalizedSchema, options?: ZodGeneratorOptions): string {
  const rootName = options?.rootName || "InferredSchema";
  const declarations: string[] = [`import { z } from "zod";\n`];

  // We'll generate nested schemas bottom-up or just use a helper function to collect them
  const extraSchemas: string[] = [];

  if (schema.rootType === "object") {
    const rootSchema = generateZodObject(rootName, schema.fields, extraSchemas);
    extraSchemas.push(`export const ${capitalize(rootName)}Schema = ${rootSchema};`);
  } else if (schema.rootType === "array" && schema.arrayItem?.objectSchema) {
    const itemSchemaName = `${capitalize(rootName)}Item`;
    const itemSchema = generateZodObject(
      itemSchemaName,
      schema.arrayItem.objectSchema,
      extraSchemas
    );
    extraSchemas.push(`export const ${itemSchemaName}Schema = ${itemSchema};`);
    extraSchemas.push(
      `export const ${capitalize(rootName)}Schema = z.array(${itemSchemaName}Schema);`
    );
  } else {
    // Primitive or array of primitives
    const typeStr =
      schema.rootType === "array"
        ? `z.array(${generateZodPrimitive(schema.arrayItem?.types ?? ["unknown"])})`
        : generateZodPrimitive([schema.rootType]);
    extraSchemas.push(`export const ${capitalize(rootName)}Schema = ${typeStr};`);
  }

  declarations.push(...extraSchemas);
  return declarations.join("\n\n") + "\n";
}

function generateZodObject(
  name: string,
  fields: Record<string, NormalizedField>,
  extraSchemas: string[]
): string {
  let result = `z.object({\n`;

  for (const [key, field] of Object.entries(fields)) {
    let fieldZod = "";

    if (field.types.includes("object") && field.objectSchema) {
      const nestedName = `${capitalize(name)}${capitalize(key)}`;
      const nestedSchema = generateZodObject(nestedName, field.objectSchema, extraSchemas);
      extraSchemas.push(`export const ${nestedName}Schema = ${nestedSchema};`);
      fieldZod = `${nestedName}Schema`;
    } else if (field.types.includes("array") && field.arrayItem) {
      if (field.arrayItem.objectSchema) {
        const nestedName = `${capitalize(name)}${capitalize(key)}Item`;
        const nestedSchema = generateZodObject(
          nestedName,
          field.arrayItem.objectSchema,
          extraSchemas
        );
        extraSchemas.push(`export const ${nestedName}Schema = ${nestedSchema};`);
        fieldZod = `z.array(${nestedName}Schema)`;
      } else {
        fieldZod = `z.array(${generateZodPrimitive(field.arrayItem.types)})`;
      }
    } else {
      fieldZod = generateZodPrimitive(field.types);
    }

    if (field.isNullable) {
      fieldZod += `.nullable()`;
    }

    if (field.isOptional) {
      fieldZod += `.optional()`;
    }

    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
    result += `  ${safeKey}: ${fieldZod},\n`;
  }

  result += `})`;
  return result;
}

function generateZodPrimitive(types: string[]): string {
  if (types.length === 0) return "z.unknown()";
  if (types.length === 1) {
    if (types[0] === "unknown") return "z.unknown()";
    return `z.${types[0]}()`;
  }

  const unionTypes = types.map((t) => (t === "unknown" ? "z.unknown()" : `z.${t}()`));
  return `z.union([${unionTypes.join(", ")}])`;
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
