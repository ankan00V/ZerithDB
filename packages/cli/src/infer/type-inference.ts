import {
  RawScanMetadata,
  RawFieldMetadata,
  RawArrayMetadata,
  NormalizedSchema,
  NormalizedField,
} from "./types.js";

export function inferTypes(raw: RawScanMetadata): NormalizedSchema {
  return {
    rootType: raw.rootType,
    fields: normalizeFields(raw.fields, 1),
    arrayItem: raw.arrayTypes ? normalizeArray(raw.arrayTypes) : undefined,
  };
}

function normalizeFields(
  rawFields: Record<string, RawFieldMetadata> | undefined,
  parentObjectCount: number
): Record<string, NormalizedField> {
  const result: Record<string, NormalizedField> = {};
  if (!rawFields) return result;

  for (const [key, fieldMeta] of Object.entries(rawFields)) {
    const isOptional = fieldMeta.count < parentObjectCount;
    const isNullable = fieldMeta.types.has("null");

    const types = Array.from(fieldMeta.types).filter((t) => t !== "null");
    if (types.length === 0) types.push("unknown"); // If it was only null

    result[key] = {
      types,
      isOptional,
      isNullable,
      arrayItem: fieldMeta.arrayTypes ? normalizeArray(fieldMeta.arrayTypes) : undefined,
      objectSchema: fieldMeta.objectFields
        ? normalizeFields(fieldMeta.objectFields, fieldMeta.count) // For nested objects, the parent count is the number of times this object appeared
        : undefined,
    };
  }

  return result;
}

function normalizeArray(rawArray: RawArrayMetadata): NormalizedField {
  const isNullable = rawArray.types.has("null");
  const types = Array.from(rawArray.types).filter((t) => t !== "null");
  if (types.length === 0) types.push("unknown");

  return {
    types,
    isOptional: false, // Array item itself isn't optional, it just might not exist if array is empty
    isNullable,
    objectSchema: rawArray.objectFields
      ? normalizeFields(rawArray.objectFields, rawArray.objectCount)
      : undefined,
  };
}
