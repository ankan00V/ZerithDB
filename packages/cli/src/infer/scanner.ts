import { RawFieldMetadata, RawArrayMetadata, RawScanMetadata, SchemaType } from "./types.js";

function getType(value: unknown): SchemaType {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "object") return "object";
  if (typeof value === "string") return "string";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "unknown";
}

export function scan(data: unknown): RawScanMetadata {
  const rootType = getType(data);
  const metadata: RawScanMetadata = {
    rootType,
    fields: {},
  };

  if (rootType === "object" && data !== null) {
    scanObject(data as Record<string, unknown>, metadata.fields);
  } else if (rootType === "array" && Array.isArray(data)) {
    metadata.arrayTypes = { types: new Set(), objectCount: 0 };
    scanArray(data, metadata.arrayTypes);
  }

  return metadata;
}

function scanObject(
  obj: Record<string, unknown>,
  fieldsMap: Record<string, RawFieldMetadata>
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (!fieldsMap[key]) {
      fieldsMap[key] = { types: new Set(), count: 0 };
    }
    const fieldMeta = fieldsMap[key];
    fieldMeta.count++;

    const valueType = getType(value);
    fieldMeta.types.add(valueType);

    if (valueType === "object" && value !== null) {
      if (!fieldMeta.objectFields) fieldMeta.objectFields = {};
      scanObject(value as Record<string, unknown>, fieldMeta.objectFields);
    } else if (valueType === "array" && Array.isArray(value)) {
      if (!fieldMeta.arrayTypes) fieldMeta.arrayTypes = { types: new Set(), objectCount: 0 };
      scanArray(value, fieldMeta.arrayTypes);
    }
  }
}

function scanArray(arr: unknown[], arrayMeta: RawArrayMetadata): void {
  for (const item of arr) {
    const itemType = getType(item);
    arrayMeta.types.add(itemType);

    if (itemType === "object" && item !== null) {
      arrayMeta.objectCount++;
      if (!arrayMeta.objectFields) arrayMeta.objectFields = {};
      scanObject(item as Record<string, unknown>, arrayMeta.objectFields);
    } else if (itemType === "array" && Array.isArray(item)) {
      // For arrays of arrays, we could track nested array items, but for now we simplify
      // or we can just say "array". Proper nested array scanning can get complex, but we'll
      // add basic support if needed. Let's just track it as "array".
    }
  }
}
