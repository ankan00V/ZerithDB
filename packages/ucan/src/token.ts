import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type {
  UCANAbility, UCANCapability, UCANHeader,
  UCANPayload, UCANResource, UCANRole, UCANToken,
} from "./types.js";
import { ROLE_ABILITIES } from "./types.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface IssueOptions {
  audience:     string;
  capabilities: Record<UCANResource, UCANCapability>;
  ttlSeconds?:  number | null;
  proofs?:      string[];
  facts?:       Record<string, unknown>;
}

export class UCANIssuer {
  constructor(
    private readonly privateKeyBytes: Uint8Array,
    private readonly issuerDid: string
  ) {}

  async issue(options: IssueOptions): Promise<UCANToken> {
    const now = Math.floor(Date.now() / 1000);

    const header: UCANHeader = { alg: "EdDSA", typ: "UCAN", v: "0.10.0" };
    const payload: UCANPayload = {
      iss: this.issuerDid,
      aud: options.audience,
      exp: options.ttlSeconds != null ? now + options.ttlSeconds : null,
      nbf: now,
      nnc: generateNonce(),
      cap: options.capabilities,
      prf: options.proofs ?? [],
      ...(options.facts ? { fct: options.facts } : {}),
    };

    const headerB64    = toBase64Url(JSON.stringify(header));
    const payloadB64   = toBase64Url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const sigBytes = await ed.signAsync(
      new TextEncoder().encode(signingInput),
      this.privateKeyBytes
    );
    const sigB64  = bytesToBase64Url(sigBytes);
    const encoded = `${signingInput}.${sigB64}`;

    return { header, payload, signature: sigB64, encoded };
  }

  async issueForRole(
    audience:   string,
    appId:      string,
    role:       UCANRole,
    collection: string = "*",
    ttlSeconds: number = 86_400
  ): Promise<UCANToken> {
    const resource: UCANResource = `zerithdb://${appId}/${collection}`;
    return this.issue({
      audience,
      capabilities: { [resource]: { can: ROLE_ABILITIES[role] } },
      ttlSeconds,
    });
  }

  async delegate(
    parentToken: UCANToken,
    options:     Omit<IssueOptions, "proofs">
  ): Promise<UCANToken> {
    this.assertDelegationIsAttenuation(parentToken, options.capabilities);
    return this.issue({ ...options, proofs: [parentToken.encoded] });
  }

  private assertDelegationIsAttenuation(
    parent:    UCANToken,
    requested: Record<UCANResource, UCANCapability>
  ): void {
    for (const [resource, cap] of Object.entries(requested)) {
      const parentCap = findMatchingCapability(parent.payload.cap, resource);
      if (parentCap === null) {
        throw new Error(
          `Delegation error: issuer has no capability on resource "${resource}"`
        );
      }
      for (const ability of cap.can) {
        if (!isAbilityGranted(parentCap.can, ability)) {
          throw new Error(
            `Delegation error: cannot grant "${ability}" on "${resource}" — issuer only has [${parentCap.can.join(", ")}]`
          );
        }
      }
    }
  }
}

export function findMatchingCapability(
  cap:      Record<UCANResource, UCANCapability>,
  resource: UCANResource
): UCANCapability | null {
  if (cap[resource]) return cap[resource]!;
  const wildcardBase = resource.replace(/\/[^/]+$/, "/*");
  if (cap[wildcardBase]) return cap[wildcardBase]!;
  if (cap["*"]) return cap["*"]!;
  return null;
}

export function isAbilityGranted(
  granted:   UCANAbility[],
  requested: UCANAbility
): boolean {
  if (granted.includes("*")) return true;
  if (granted.includes(requested)) return true;
  if (granted.includes("db/admin") && requested.startsWith("db/")) return true;
  return false;
}

function toBase64Url(str: string): string {
  return bytesToBase64Url(new TextEncoder().encode(str));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}