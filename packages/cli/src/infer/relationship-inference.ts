import { NormalizedSchema, NormalizedField, RelationshipMetadata } from "./types.js";

export function inferRelationships(schema: NormalizedSchema): NormalizedSchema {
  // If the root is an object or array of objects, we can look for foreign keys
  if (
    schema.rootType === "object" ||
    (schema.rootType === "array" && schema.arrayItem?.objectSchema)
  ) {
    const targetFields =
      schema.rootType === "object" ? schema.fields : schema.arrayItem!.objectSchema!;
    inferObjectRelationships(targetFields);
  }

  return schema;
}

function inferObjectRelationships(fields: Record<string, NormalizedField>): void {
  for (const [key, field] of Object.entries(fields)) {
    if (field.types.includes("number") || field.types.includes("string")) {
      const rel = guessRelationship(key);
      if (rel) {
        field.relationship = rel;
      }
    }

    if (field.objectSchema) {
      inferObjectRelationships(field.objectSchema);
    }

    if (field.arrayItem?.objectSchema) {
      inferObjectRelationships(field.arrayItem.objectSchema);
    }
  }
}

function guessRelationship(fieldName: string): RelationshipMetadata | undefined {
  // Common patterns: userId, user_id, authorId, post_id
  const match = fieldName.match(/^([a-zA-Z0-9_]+?)(?:Id|_id)$/);

  if (match && match[1]) {
    const targetModel = match[1];
    // Ignore simply "id" or "_id" as they are primary keys, not foreign keys
    if (targetModel.toLowerCase() === "id" || targetModel === "") {
      return undefined;
    }

    return {
      targetModel,
      targetField: "id", // Default assumption
      type: "belongsTo",
    };
  }

  return undefined;
}
