export type FieldKind = "string" | "number" | "boolean" | "custom";

export type SchemaField = {
  id: string;
  name: string;
  kind: FieldKind;
  customType?: string;
  required: boolean;
  array: boolean;
};

export type SchemaNode = {
  id: string;
  name: string;
  x: number;
  y: number;
  fields: SchemaField[];
};

export type SchemaEdge = {
  id: string;
  from: string; // node id
  to: string; // node id
  label: string;
};
