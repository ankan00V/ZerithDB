export type UCANAbility = "db/read" | "db/write" | "db/delete" | "db/admin" | "*";
export type UCANResource = string;
export type UCANRole = "admin" | "readwrite" | "readonly";

export const ROLE_ABILITIES: Record<UCANRole, UCANAbility[]> = {
  admin:     ["db/read", "db/write", "db/delete", "db/admin"],
  readwrite: ["db/read", "db/write"],
  readonly:  ["db/read"],
};

export interface UCANCapability {
  can: UCANAbility[];
}

export interface UCANHeader {
  alg: "EdDSA";
  typ: "UCAN";
  v:   "0.10.0";
}

export interface UCANPayload {
  iss: string;
  aud: string;
  exp: number | null;
  nbf?: number;
  nnc: string;
  cap: Record<UCANResource, UCANCapability>;
  prf: string[];
  fct?: Record<string, unknown>;
}

export interface UCANToken {
  header:    UCANHeader;
  payload:   UCANPayload;
  signature: string;
  encoded:   string;
}

export type UCANVerifyResult =
  | { ok: true;  token: UCANToken }
  | { ok: false; reason: string };