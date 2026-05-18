export type PrimitiveType = "string" | "number" | "boolean" | "null";
export type ComplexType = "object" | "array" | "unknown";
export type SchemaType = PrimitiveType | ComplexType;

// Raw Scanner Metadata Structures
export interface RawFieldMetadata {
  types: Set<SchemaType>;
  count: number;
  arrayTypes?: RawArrayMetadata;
  objectFields?: Record<string, RawFieldMetadata>;
}

export interface RawArrayMetadata {
  types: Set<SchemaType>;
  objectCount: number;
  objectFields?: Record<string, RawFieldMetadata>; // If array contains objects
}

export interface RawScanMetadata {
  rootType: SchemaType;
  fields: Record<string, RawFieldMetadata>; // If root is object
  arrayTypes?: RawArrayMetadata; // If root is array
}

// Normalized Internal Schema Structures
export interface NormalizedField {
  types: SchemaType[];
  isOptional: boolean;
  isNullable: boolean;
  arrayItem?: NormalizedField;
  objectSchema?: Record<string, NormalizedField>;
  relationship?: RelationshipMetadata;
}

export interface NormalizedSchema {
  rootType: SchemaType;
  fields: Record<string, NormalizedField>;
  arrayItem?: NormalizedField;
}

// Relationship Inference Structures
export interface RelationshipMetadata {
  targetModel: string;
  targetField: string;
  type: "belongsTo" | "hasMany";
}
