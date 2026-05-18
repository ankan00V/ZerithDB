import { describe, it, expect, beforeAll } from "vitest";
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { UCANIssuer } from "../token.js";
import { UCANVerifier } from "../verifier.js";
import { CapabilityBlocklist } from "../blocklist.js";
import { UCANSyncPlugin } from "../plugin.js";

ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

async function makeIdentity() {
  const privateKey  = ed.utils.randomPrivateKey();
  const pubKeyBytes = await ed.getPublicKeyAsync(privateKey);
  const publicKey   = Array.from(pubKeyBytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  const did         = `did:key:z${publicKey}`;
  return { privateKey, publicKey, did };
}

describe("UCANIssuer", () => {
  let owner: Awaited<ReturnType<typeof makeIdentity>>;
  let peer:  Awaited<ReturnType<typeof makeIdentity>>;

  beforeAll(async () => {
    owner = await makeIdentity();
    peer  = await makeIdentity();
  });

  it("issues a valid token with explicit capabilities", async () => {
    const issuer = new UCANIssuer(owner.privateKey, owner.did);
    const token  = await issuer.issue({
      audience:     peer.did,
      capabilities: { "zerithdb://my-app/*": { can: ["db/read"] } },
      ttlSeconds:   3600,
    });
    expect(token.encoded.split(".")).toHaveLength(3);
    expect(token.payload.iss).toBe(owner.did);
    expect(token.payload.aud).toBe(peer.did);
    expect(token.payload.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("issueForRole produces correct abilities for readonly", async () => {
    const issuer = new UCANIssuer(owner.privateKey, owner.did);
    const token  = await issuer.issueForRole(peer.did, "my-app", "readonly");
    expect(token.payload.cap["zerithdb://my-app/*"]?.can).toEqual(["db/read"]);
  });

  it("issueForRole produces correct abilities for admin", async () => {
    const issuer = new UCANIssuer(owner.privateKey, owner.did);
    const token  = await issuer.issueForRole(peer.did, "my-app", "admin");
    expect(token.payload.cap["zerithdb://my-app/*"]?.can).toContain("db/admin");
    expect(token.payload.cap["zerithdb://my-app/*"]?.can).toContain("db/read");
  });

  it("delegate() creates a chained proof token", async () => {
    const delegate   = await makeIdentity();
    const issuer     = new UCANIssuer(owner.privateKey, owner.did);
    const parent     = await issuer.issueForRole(peer.did, "my-app", "readwrite");
    const peerIssuer = new UCANIssuer(peer.privateKey, peer.did);
    const delegated  = await peerIssuer.delegate(parent, {
      audience:     delegate.did,
      capabilities: { "zerithdb://my-app/*": { can: ["db/read"] } },
      ttlSeconds:   1800,
    });
    expect(delegated.payload.prf).toContain(parent.encoded);
    expect(delegated.payload.iss).toBe(peer.did);
    expect(delegated.payload.aud).toBe(delegate.did);
  });

  it("delegate() throws when granting more than parent allows", async () => {
    const delegate   = await makeIdentity();
    const issuer     = new UCANIssuer(owner.privateKey, owner.did);
    const parent     = await issuer.issueForRole(peer.did, "my-app", "readonly");
    const peerIssuer = new UCANIssuer(peer.privateKey, peer.did);
    await expect(
      peerIssuer.delegate(parent, {
        audience:     delegate.did,
        capabilities: { "zerithdb://my-app/*": { can: ["db/write"] } },
        ttlSeconds:   1800,
      })
    ).rejects.toThrow(/cannot grant/i);
  });
});

describe("UCANVerifier", () => {
  let owner: Awaited<ReturnType<typeof makeIdentity>>;
  let peer:  Awaited<ReturnType<typeof makeIdentity>>;

  beforeAll(async () => {
    owner = await makeIdentity();
    peer  = await makeIdentity();
  });

  it("verifies a valid token", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issue({
      audience:     peer.did,
      capabilities: { "zerithdb://my-app/*": { can: ["db/write"] } },
      ttlSeconds:   3600,
    });
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(token.encoded, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/todos",
      requiredAbility:  "db/write",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects wrong audience", async () => {
    const other    = await makeIdentity();
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(peer.did, "my-app", "readonly");
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(token.encoded, {
      expectedAudience: other.did,
      resource:         "zerithdb://my-app/*",
      requiredAbility:  "db/read",
    });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/audience/i);
  });

  it("rejects expired token", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issue({
      audience:     peer.did,
      capabilities: { "zerithdb://my-app/*": { can: ["db/read"] } },
      ttlSeconds:   -10,
    });
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(token.encoded, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/*",
      requiredAbility:  "db/read",
    });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/expired/i);
  });

  it("rejects tampered token", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(peer.did, "my-app", "readonly");
    const parts    = token.encoded.split(".");
    const tampered = `${parts[0]}.AAAAAAA.${parts[2]}`;
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(tampered, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/*",
      requiredAbility:  "db/read",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects insufficient ability (readonly cannot write)", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(peer.did, "my-app", "readonly");
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(token.encoded, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/*",
      requiredAbility:  "db/write",
    });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/does not grant/i);
  });

  it("admin token satisfies any db/* ability", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(peer.did, "my-app", "admin");
    const verifier = new UCANVerifier();
    for (const ability of ["db/read", "db/write", "db/delete"] as const) {
      const result = await verifier.verify(token.encoded, {
        expectedAudience: peer.did,
        resource:         "zerithdb://my-app/*",
        requiredAbility:  ability,
      });
      expect(result.ok).toBe(true);
    }
  });

  it("rejects revoked token", async () => {
    const blocklist = new CapabilityBlocklist();
    const issuer    = new UCANIssuer(owner.privateKey, owner.did);
    const token     = await issuer.issueForRole(peer.did, "my-app", "readwrite");
    blocklist.revoke(token.payload.nnc);
    const verifier  = new UCANVerifier();
    const result    = await verifier.verify(token.encoded, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/*",
      requiredAbility:  "db/write",
      blocklist,
    });
    expect(result.ok).toBe(false);
    expect((result as any).reason).toMatch(/revoked/i);
  });

  it("wildcard resource covers specific collection", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issue({
      audience:     peer.did,
      capabilities: { "zerithdb://my-app/*": { can: ["db/write"] } },
      ttlSeconds:   3600,
    });
    const verifier = new UCANVerifier();
    const result   = await verifier.verify(token.encoded, {
      expectedAudience: peer.did,
      resource:         "zerithdb://my-app/todos",
      requiredAbility:  "db/write",
    });
    expect(result.ok).toBe(true);
  });
});

describe("CapabilityBlocklist", () => {
  it("revokes and detects a nonce", async () => {
    const bl = new CapabilityBlocklist();
    bl.revoke("nonce-abc");
    expect(await bl.isRevoked("nonce-abc")).toBe(true);
    expect(await bl.isRevoked("nonce-xyz")).toBe(false);
  });

  it("bulk load and export round-trips", () => {
    const bl = new CapabilityBlocklist();
    bl.loadEntries(["a", "b", "c"]);
    expect(bl.exportEntries().sort()).toEqual(["a", "b", "c"]);
    expect(bl.size).toBe(3);
  });
});

describe("UCANSyncPlugin", () => {
  let owner:        Awaited<ReturnType<typeof makeIdentity>>;
  let peer:         Awaited<ReturnType<typeof makeIdentity>>;
  let readonlyPeer: Awaited<ReturnType<typeof makeIdentity>>;

  beforeAll(async () => {
    owner        = await makeIdentity();
    peer         = await makeIdentity();
    readonlyPeer = await makeIdentity();
  });

  it("allows update from peer with valid write token", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(peer.did, "my-app", "readwrite");
    const tokenMap = new Map([[peer.did, token.encoded]]);
    const plugin   = new UCANSyncPlugin({
      appId:           "my-app",
      getTokenForPeer: (did) => tokenMap.get(did) ?? null,
    });
    const update = new Uint8Array([1, 2, 3]);
    const result = await plugin.onBeforeApplyUpdate!("todos", update, peer.did);
    expect(result).toEqual(update);
  });

  it("drops update from peer with no token", async () => {
    const plugin = new UCANSyncPlugin({
      appId:           "my-app",
      getTokenForPeer: () => null,
    });
    const result = await plugin.onBeforeApplyUpdate!("todos", new Uint8Array([1]), "did:key:zunknown");
    expect(result).toBeNull();
  });

  it("drops update from readonly peer when write is required", async () => {
    const issuer   = new UCANIssuer(owner.privateKey, owner.did);
    const token    = await issuer.issueForRole(readonlyPeer.did, "my-app", "readonly");
    const tokenMap = new Map([[readonlyPeer.did, token.encoded]]);
    const plugin   = new UCANSyncPlugin({
      appId:           "my-app",
      getTokenForPeer: (did) => tokenMap.get(did) ?? null,
      requiredAbility: "db/write",
    });
    const result = await plugin.onBeforeApplyUpdate!("todos", new Uint8Array([1]), readonlyPeer.did);
    expect(result).toBeNull();
  });

  it("drops update from peer with revoked token", async () => {
    const issuer    = new UCANIssuer(owner.privateKey, owner.did);
    const token     = await issuer.issueForRole(peer.did, "my-app", "readwrite");
    const blocklist = new CapabilityBlocklist();
    blocklist.revoke(token.payload.nnc);
    const tokenMap  = new Map([[peer.did, token.encoded]]);
    const plugin    = new UCANSyncPlugin({
      appId:           "my-app",
      getTokenForPeer: (did) => tokenMap.get(did) ?? null,
      blocklist,
    });
    const result = await plugin.onBeforeApplyUpdate!("todos", new Uint8Array([1]), peer.did);
    expect(result).toBeNull();
  });
});