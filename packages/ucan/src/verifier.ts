import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type {
  UCANAbility, UCANHeader, UCANPayload,
  UCANResource, UCANToken, UCANVerifyResult,
} from "./types.js";
import { findMatchingCapability, isAbilityGranted } from "./token.js";
import type { CapabilityBlocklist } from "./blocklist.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

export interface VerifyOptions {
  expectedAudience: string;
  resource:         UCANResource;
  requiredAbility:  UCANAbility;
  blocklist?:       CapabilityBlocklist;
}

export class UCANVerifier {
  async verify(encoded: string, options: VerifyOptions): Promise<UCANVerifyResult> {
    // 1. Parse structure
    const parsed = this.parse(encoded);
    if (!parsed.ok) return parsed;
    const token = parsed.token;

    // 2. Signature check
    const sigResult = await this.verifySignature(token);
    if (!sigResult.ok) return sigResult;

    // 3. Audience check
    if (token.payload.aud !== options.expectedAudience) {
      return {
        ok: false,
        reason: `Token audience "${token.payload.aud}" does not match expected "${options.expectedAudience}"`,
      };
    }

    // 4. Temporal validity
    const nowSec = Math.floor(Date.now() / 1000);
    if (token.payload.exp !== null && nowSec > token.payload.exp) {
      return { ok: false, reason: "Token has expired" };
    }
    if (token.payload.nbf !== undefined && nowSec < token.payload.nbf) {
      return { ok: false, reason: "Token is not yet valid (nbf)" };
    }

    // 5. Capability check (own + proof chain)
    const hasCapability = await this.resolveCapability(
      token, options.resource, options.requiredAbility
    );
    if (!hasCapability) {
      return {
        ok: false,
        reason: `Token does not grant "${options.requiredAbility}" on "${options.resource}"`,
      };
    }

    // 6. Revocation check
    if (options.blocklist) {
      const revoked = await options.blocklist.isRevoked(token.payload.nnc);
      if (revoked) return { ok: false, reason: "Token has been revoked" };
    }

    return { ok: true, token };
  }

  parse(encoded: string): UCANVerifyResult {
    const parts = encoded.split(".");
    if (parts.length !== 3) {
      return { ok: false, reason: "Malformed UCAN: expected 3 base64url segments" };
    }
    try {
      const header  = JSON.parse(fromBase64Url(parts[0]!)) as UCANHeader;
      const payload = JSON.parse(fromBase64Url(parts[1]!)) as UCANPayload;
      if (header.typ !== "UCAN") {
        return { ok: false, reason: `Invalid token type: "${header.typ}"` };
      }
      return { ok: true, token: { header, payload, signature: parts[2]!, encoded } };
    } catch {
      return { ok: false, reason: "Failed to decode UCAN segments" };
    }
  }

  private async verifySignature(token: UCANToken): Promise<UCANVerifyResult> {
    try {
      const [headerB64, payloadB64] = token.encoded.split(".");
      const signingInput   = `${headerB64}.${payloadB64}`;
      const signingBytes   = new TextEncoder().encode(signingInput);
      const sigBytes       = base64UrlToBytes(token.signature);
      const publicKeyHex   = token.payload.iss.replace(/^did:key:z/, "");
      const publicKeyBytes = hexToBytes(publicKeyHex);
      const valid = await ed.verifyAsync(sigBytes, signingBytes, publicKeyBytes);
      if (!valid) return { ok: false, reason: "Invalid signature" };
      return { ok: true, token };
    } catch (err) {
      return { ok: false, reason: `Signature verification failed: ${String(err)}` };
    }
  }

  private async resolveCapability(
    token:    UCANToken,
    resource: UCANResource,
    ability:  UCANAbility
  ): Promise<boolean> {
    const cap = findMatchingCapability(token.payload.cap, resource);
    if (cap && isAbilityGranted(cap.can, ability)) return true;

    for (const proof of token.payload.prf) {
      const parsed = this.parse(proof);
      if (!parsed.ok) continue;
      if (parsed.token.payload.aud !== token.payload.iss) continue;
      const proofSig = await this.verifySignature(parsed.token);
      if (!proofSig.ok) continue;
      const granted = await this.resolveCapability(parsed.token, resource, ability);
      if (granted) return true;
    }

    return false;
  }
}

function fromBase64Url(str: string): string {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padded  = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(padded);
}

function base64UrlToBytes(str: string): Uint8Array {
  const binary = fromBase64Url(str);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}