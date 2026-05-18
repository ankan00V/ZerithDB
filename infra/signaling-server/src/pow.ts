import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

export const POW_ALGORITHM = "hashcash-sha256";

export interface PowChallengeResponse {
  algorithm: typeof POW_ALGORITHM;
  challenge: string;
  difficulty: number;
  expiresAt: number;
}

export interface PowSolutionInput {
  challenge?: unknown;
  nonce?: unknown;
}

export interface PowVerificationResult {
  ok: boolean;
  error?: string;
  difficulty?: number;
}

interface PowChallengePayload {
  v: 1;
  algorithm: typeof POW_ALGORITHM;
  room: string;
  peer: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  difficulty: number;
}

export interface PowPolicyInput {
  baseDifficulty: number;
  maxDifficulty: number;
  loadStep: number;
  activePeers: number;
  threatLevel: number;
}

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const MAX_CHALLENGE_LENGTH = 2048;
const MAX_NONCE_LENGTH = 64;

export function calculatePowDifficulty(input: PowPolicyInput): number {
  const baseDifficulty = clampInteger(input.baseDifficulty, 0, 30);
  const maxDifficulty = clampInteger(input.maxDifficulty, baseDifficulty, 30);
  const loadStep = Math.max(1, Math.floor(input.loadStep));
  const threatLevel = clampInteger(input.threatLevel, 0, 10);
  const activePeers = Math.max(0, Math.floor(input.activePeers));
  const loadBump = Math.floor(activePeers / loadStep);

  return Math.min(maxDifficulty, baseDifficulty + loadBump + threatLevel * 2);
}

export function createPowChallenge(params: {
  room: string;
  peer: string;
  difficulty: number;
  secret: string;
  ttlMs: number;
  now?: number;
}): PowChallengeResponse {
  const now = params.now ?? Date.now();
  const payload: PowChallengePayload = {
    v: 1,
    algorithm: POW_ALGORITHM,
    room: params.room,
    peer: params.peer,
    nonce: randomBytes(16).toString("base64url"),
    issuedAt: now,
    expiresAt: now + params.ttlMs,
    difficulty: clampInteger(params.difficulty, 0, 30),
  };
  const encodedPayload = encodeJson(payload);
  const signature = sign(encodedPayload, params.secret);

  return {
    algorithm: POW_ALGORITHM,
    challenge: `${encodedPayload}.${signature}`,
    difficulty: payload.difficulty,
    expiresAt: payload.expiresAt,
  };
}

export function verifyPowSolution(params: {
  solution: PowSolutionInput | null | undefined;
  room: string;
  peer: string;
  secret: string;
  now?: number;
  markUsed?: (key: string, expiresAt: number) => boolean;
}): PowVerificationResult {
  const challenge = params.solution?.challenge;
  const nonce = params.solution?.nonce;

  if (typeof challenge !== "string" || typeof nonce !== "string") {
    return { ok: false, error: "Missing proof-of-work solution" };
  }

  if (
    challenge.length === 0 ||
    challenge.length > MAX_CHALLENGE_LENGTH ||
    nonce.length === 0 ||
    nonce.length > MAX_NONCE_LENGTH
  ) {
    return { ok: false, error: "Invalid proof-of-work shape" };
  }

  const payload = decodeAndVerifyChallenge(challenge, params.secret);
  if (payload === null) {
    return { ok: false, error: "Invalid proof-of-work challenge" };
  }

  const now = params.now ?? Date.now();
  if (payload.expiresAt <= now) {
    return { ok: false, error: "Expired proof-of-work challenge" };
  }

  if (payload.room !== params.room || payload.peer !== params.peer) {
    return { ok: false, error: "Proof-of-work challenge does not match peer" };
  }

  const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
  const leadingZeroBits = countLeadingZeroBits(digest);
  if (leadingZeroBits < payload.difficulty) {
    return { ok: false, error: "Proof-of-work solution is below difficulty" };
  }

  const replayKey = createReplayKey(challenge, nonce);
  if (params.markUsed?.(replayKey, payload.expiresAt) === false) {
    return { ok: false, error: "Proof-of-work solution was already used" };
  }

  return { ok: true, difficulty: payload.difficulty };
}

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly maxKeys = 50_000
  ) {}

  check(key: string, now = Date.now()): boolean {
    if (this.limit <= 0) return true;

    const existing = this.entries.get(key);
    if (existing === undefined || existing.resetAt <= now) {
      this.trim(now);
      this.entries.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }

    if (existing.count >= this.limit) {
      return false;
    }

    existing.count++;
    return true;
  }

  cleanup(now = Date.now()): void {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }
  }

  private trim(now: number): void {
    this.cleanup(now);
    if (this.entries.size < this.maxKeys) return;

    const oldestKey = this.entries.keys().next().value as string | undefined;
    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }
}

export function countLeadingZeroBits(bytes: Uint8Array): number {
  let count = 0;
  for (const byte of bytes) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit--) {
      if (((byte >> bit) & 1) === 0) {
        count++;
      } else {
        return count;
      }
    }
  }
  return count;
}

function decodeAndVerifyChallenge(challenge: string, secret: string): PowChallengePayload | null {
  const [encodedPayload, signature, extra] = challenge.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;
  if (!verifySignature(encodedPayload, signature, secret)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      [key: string]: unknown;
    };

    if (
      payload["v"] !== 1 ||
      payload["algorithm"] !== POW_ALGORITHM ||
      typeof payload["room"] !== "string" ||
      typeof payload["peer"] !== "string" ||
      typeof payload["nonce"] !== "string" ||
      typeof payload["issuedAt"] !== "number" ||
      typeof payload["expiresAt"] !== "number" ||
      typeof payload["difficulty"] !== "number" ||
      !Number.isInteger(payload["difficulty"]) ||
      payload["difficulty"] < 0 ||
      payload["difficulty"] > 30
    ) {
      return null;
    }

    return payload as unknown as PowChallengePayload;
  } catch {
    return null;
  }
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(encodedPayload: string, secret: string): string {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

function verifySignature(encodedPayload: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(encodedPayload, secret), "base64url");
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }

  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createReplayKey(challenge: string, nonce: string): string {
  return createHash("sha256").update(`${challenge}:${nonce}`).digest("base64url");
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
