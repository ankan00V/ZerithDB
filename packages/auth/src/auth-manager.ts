import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import type { ZerithDBConfig, Identity, Signature } from "zerithdb-core";
import { ZerithDBError, ErrorCode, EventEmitter } from "zerithdb-core";
import { timingSafeEqual } from "./timing-safe.js";
import { splitSecret, recoverSecret } from "zerithdb-wasm-crypto";
import { BiometricKeyManager } from "./biometric-key.js";

interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const memoryStorage = new Map<string, string>();

function resolveStorage(): KeyValueStorage {
  try {
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    // Ignore environments where localStorage exists but is inaccessible.
  }

  return {
    getItem(key: string): string | null {
      return memoryStorage.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      memoryStorage.set(key, value);
    },
    removeItem(key: string): void {
      memoryStorage.delete(key);
    },
  };
}

// noble/ed25519 requires a sha512 implementation
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

type AuthEvents = {
  "identity:change": Identity | null;
};

/**
 * Manages the local Ed25519 keypair identity for this ZerithDB instance.
 * Identities are stored in localStorage as hex-encoded keys.
 * No servers involved — identity is fully self-sovereign.
 */
export class AuthManager extends EventEmitter<AuthEvents> {
  private readonly storageKey: string;
  private readonly storage: KeyValueStorage;
  private _identity: Identity | null = null;
  private privateKeyBytes: Uint8Array | null = null;
  public readonly biometric = new BiometricKeyManager();

  constructor(config: ZerithDBConfig) {
    super();
    this.storageKey = config.auth?.storageKey ?? "__zerithdb_identity";
    this.storage = resolveStorage();
  }

  /**
   * Sign in to ZerithDB.
   * - If a keypair already exists in localStorage, it is loaded.
   * - If not, a new Ed25519 keypair is generated and stored.
   *
   * @returns The current {@link Identity}
   */
  async signIn(): Promise<Identity> {
    if (this._identity !== null) return this._identity;

    const stored = this.loadFromStorage();
    if (stored !== null) {
      this._identity = stored.identity;
      this.privateKeyBytes = stored.privateKeyBytes;
      this.emit("identity:change", this._identity);
      return this._identity;
    }

    return this.generateIdentity();
  }

  /**
   * Generate a brand-new identity, replacing any existing one.
   * ⚠️ This is destructive — the old identity cannot be recovered.
   */
  async generateIdentity(): Promise<Identity> {
    const privateKey = ed.utils.randomPrivateKey();
    const publicKeyBytes = await ed.getPublicKeyAsync(privateKey);

    const identity = this.buildIdentity(publicKeyBytes);
    this._identity = identity;
    this.privateKeyBytes = privateKey;

    this.saveToStorage(privateKey, publicKeyBytes);
    this.emit("identity:change", identity);
    return identity;
  }

  /**
   * Sign arbitrary bytes with the local private key.
   * Used to authenticate sync updates sent to peers.
   */
  async sign(data: Uint8Array): Promise<Signature> {
    if (this.privateKeyBytes === null) {
      throw new ZerithDBError(
        ErrorCode.AUTH_KEY_NOT_FOUND,
        "No identity loaded. Call auth.signIn() first."
      );
    }

    try {
      const sig = await ed.signAsync(data, this.privateKeyBytes);
      return bytesToHex(sig);
    } catch (err) {
      throw new ZerithDBError(ErrorCode.AUTH_SIGN_FAILED, "Failed to sign data", {
        cause: err,
      });
    }
  }

  /**
   * Verify a signature against a public key.
   *
   * @param data - The original data that was signed
   * @param signature - Hex-encoded signature
   * @param publicKey - Hex-encoded Ed25519 public key
   */
  async verify(data: Uint8Array, signature: Signature, publicKey: string): Promise<boolean> {
    try {
      return await ed.verifyAsync(hexToBytes(signature), data, hexToBytes(publicKey));
    } catch {
      return false;
    }
  }

  /**
   * Securely compares two authentication token challenges in constant time.
   * Mitigates potential timing attacks against the P2P cluster syncing auth protocols.
   * Highly critical for distributed network synchronization.
   */
  verifyPeerChallenge(expected: string, received: string): boolean {
    try {
      const expectedBytes = hexToBytes(expected);
      const receivedBytes = hexToBytes(received);
      return timingSafeEqual(expectedBytes, receivedBytes);
    } catch {
      return false;
    }
  }

  /** The currently loaded identity, or null if not signed in */
  get identity(): Identity | null {
    return this._identity;
  }

  /** Sign out and clear the stored identity */
  signOut(): void {
    if (this._identity !== null) {
      this._identity = null;
      this.privateKeyBytes = null;
      try {
        this.storage.removeItem(this.storageKey);
      } catch {
        // localStorage may not be available in all environments
      }
      this.emit("identity:change", null);
    }
  }

  /**
   * Generate recovery shards for the current master identity private key using Shamir's Secret Sharing.
   */
  async generateRecoveryShards(threshold: number, total: number): Promise<string[]> {
    if (this.privateKeyBytes === null) {
      throw new ZerithDBError(
        ErrorCode.AUTH_KEY_NOT_FOUND,
        "No identity loaded. Call auth.signIn() first before generating shards."
      );
    }
    return splitSecret(this.privateKeyBytes, threshold, total);
  }

  /**
   * Recover and restore the master identity private key using a threshold of base64-encoded shards.
   */
  async recoverIdentity(shards: string[]): Promise<Identity> {
    try {
      const privateKey = await recoverSecret(shards);
      const publicKeyBytes = await ed.getPublicKeyAsync(privateKey);

      const identity = this.buildIdentity(publicKeyBytes);
      this._identity = identity;
      this.privateKeyBytes = privateKey;

      this.saveToStorage(privateKey, publicKeyBytes);
      this.emit("identity:change", identity);
      return identity;
    } catch (err) {
      throw new ZerithDBError(
        ErrorCode.AUTH_VERIFY_FAILED,
        "Failed to reconstruct master key from the provided shards. Ensure the shards are correct and meet the required threshold.",
        { cause: err }
      );
    }
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private buildIdentity(publicKeyBytes: Uint8Array): Identity {
    const publicKey = bytesToHex(publicKeyBytes);
    // Simplified DID:key — in production use proper multibase encoding
    const did = `did:key:z${publicKey}`;
    return { did, publicKey, createdAt: Date.now() };
  }

  private saveToStorage(privateKey: Uint8Array, publicKey: Uint8Array): void {
    try {
      this.storage.setItem(
        this.storageKey,
        JSON.stringify({
          privateKey: bytesToHex(privateKey),
          publicKey: bytesToHex(publicKey),
          createdAt: Date.now(),
        })
      );
    } catch {
      // localStorage quota exceeded or unavailable — identity lives only in memory
    }
  }

  private loadFromStorage(): {
    identity: Identity;
    privateKeyBytes: Uint8Array;
  } | null {
    try {
      const raw = this.storage.getItem(this.storageKey);
      if (raw === null) return null;

      const parsed = JSON.parse(raw) as {
        privateKey: string;
        publicKey: string;
        createdAt: number;
      };

      const publicKeyBytes = hexToBytes(parsed.publicKey);
      const identity = this.buildIdentity(publicKeyBytes);
      identity.createdAt = parsed.createdAt;

      return { identity, privateKeyBytes: hexToBytes(parsed.privateKey) };
    } catch {
      return null;
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new ZerithDBError(
      ErrorCode.AUTH_VERIFY_FAILED,
      `hexToBytes() received an invalid hex string: "${hex}".`
    );
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
