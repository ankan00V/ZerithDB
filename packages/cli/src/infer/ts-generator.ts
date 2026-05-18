import { NormalizedSchema, NormalizedField } from "./types.js";

export interface TSGeneratorOptions {
  rootName?: string;
}

export function generateTypeScript(schema: NormalizedSchema, options?: TSGeneratorOptions): string {
  const rootName = options?.rootName || "InferredSchema";
  const interfaces: string[] = [];

  if (schema.rootType === "object") {
    const rootInterface = generateInterface(rootName, schema.fields, interfaces);
    interfaces.unshift(rootInterface);
  } else if (schema.rootType === "array" && schema.arrayItem?.objectSchema) {
    const itemInterfaceName = `${rootName}Item`;
    const itemInterface = generateInterface(
      itemInterfaceName,
      schema.arrayItem.objectSchema,
      interfaces
    );
    interfaces.unshift(itemInterface);
    interfaces.unshift(`export type ${rootName} = ${itemInterfaceName}[];\n`);
  } else {
    // Primitive or array of primitives
    const typeStr =
      schema.rootType === "array"
        ? `${schema.arrayItem?.types.join(" | ") ?? "unknown"}[]`
        : schema.rootType;
    interfaces.push(`export type ${rootName} = ${typeStr};\n`);
  }

  return interfaces.join("\n");
}

function generateInterface(
  name: string,
  fields: Record<string, NormalizedField>,
  interfaces: string[]
): string {
  let result = `export interface ${capitalize(name)} {\n`;

  for (const [key, field] of Object.entries(fields)) {
    const isOptional = field.isOptional ? "?" : "";
    let typeStr = "";

    if (field.types.includes("object") && field.objectSchema) {
      const nestedName = `${capitalize(name)}${capitalize(key)}`;
      const nestedInterface = generateInterface(nestedName, field.objectSchema, interfaces);
      interfaces.push(nestedInterface);
      typeStr = nestedName;
    } else if (field.types.includes("array") && field.arrayItem) {
      if (field.arrayItem.objectSchema) {
        const nestedName = `${capitalize(name)}${capitalize(key)}Item`;
        const nestedInterface = generateInterface(
          nestedName,
          field.arrayItem.objectSchema,
          interfaces
        );
        interfaces.push(nestedInterface);
        typeStr = `${nestedName}[]`;
      } else {
        typeStr = `(${field.arrayItem.types.join(" | ")})[]`;
      }
    } else {
      typeStr = field.types.join(" | ");
    }

    if (field.isNullable) {
      typeStr = `${typeStr} | null`;
    }

    if (field.relationship) {
      result += `  /**\n   * @relation ${field.relationship.type} ${field.relationship.targetModel}.${field.relationship.targetField}\n   */\n`;
    }

    // Check if key needs quotes
    const safeKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `"${key}"`;
    result += `  ${safeKey}${isOptional}: ${typeStr};\n`;
  }

  result += `}\n`;
  return result;
}

function capitalize(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
