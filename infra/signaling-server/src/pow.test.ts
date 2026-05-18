import { createHash } from "crypto";
import { describe, expect, it } from "vitest";
import {
  calculatePowDifficulty,
  countLeadingZeroBits,
  createPowChallenge,
  FixedWindowRateLimiter,
  verifyPowSolution,
} from "./pow.js";

const SECRET = "unit-test-secret";

describe("signaling proof of work", () => {
  it("scales difficulty with active peers and threat level", () => {
    expect(
      calculatePowDifficulty({
        baseDifficulty: 12,
        maxDifficulty: 24,
        loadStep: 25,
        activePeers: 0,
        threatLevel: 0,
      })
    ).toBe(12);

    expect(
      calculatePowDifficulty({
        baseDifficulty: 12,
        maxDifficulty: 24,
        loadStep: 25,
        activePeers: 55,
        threatLevel: 2,
      })
    ).toBe(18);

    expect(
      calculatePowDifficulty({
        baseDifficulty: 12,
        maxDifficulty: 16,
        loadStep: 1,
        activePeers: 1000,
        threatLevel: 10,
      })
    ).toBe(16);
  });

  it("accepts a valid challenge-bound solution", () => {
    const challenge = createPowChallenge({
      room: "room-a",
      peer: "peer-a",
      difficulty: 8,
      secret: SECRET,
      ttlMs: 60_000,
      now: 1_000,
    });
    const nonce = solve(challenge.challenge, challenge.difficulty);

    expect(
      verifyPowSolution({
        solution: { challenge: challenge.challenge, nonce },
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
        now: 2_000,
      })
    ).toEqual({ ok: true, difficulty: 8 });
  });

  it("rejects missing, tampered, expired, and mismatched solutions", () => {
    const challenge = createPowChallenge({
      room: "room-a",
      peer: "peer-a",
      difficulty: 4,
      secret: SECRET,
      ttlMs: 1_000,
      now: 1_000,
    });
    const nonce = solve(challenge.challenge, challenge.difficulty);

    expect(
      verifyPowSolution({
        solution: null,
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
      }).ok
    ).toBe(false);
    expect(
      verifyPowSolution({
        solution: { challenge: `${challenge.challenge}x`, nonce },
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
        now: 1_500,
      }).ok
    ).toBe(false);
    expect(
      verifyPowSolution({
        solution: { challenge: challenge.challenge, nonce },
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
        now: 3_000,
      }).ok
    ).toBe(false);
    expect(
      verifyPowSolution({
        solution: { challenge: challenge.challenge, nonce },
        room: "room-b",
        peer: "peer-a",
        secret: SECRET,
        now: 1_500,
      }).ok
    ).toBe(false);
  });

  it("rejects replayed solutions when a replay cache is provided", () => {
    const challenge = createPowChallenge({
      room: "room-a",
      peer: "peer-a",
      difficulty: 4,
      secret: SECRET,
      ttlMs: 60_000,
    });
    const nonce = solve(challenge.challenge, challenge.difficulty);
    const seen = new Set<string>();
    const markUsed = (key: string) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    };

    expect(
      verifyPowSolution({
        solution: { challenge: challenge.challenge, nonce },
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
        markUsed,
      }).ok
    ).toBe(true);
    expect(
      verifyPowSolution({
        solution: { challenge: challenge.challenge, nonce },
        room: "room-a",
        peer: "peer-a",
        secret: SECRET,
        markUsed,
      }).ok
    ).toBe(false);
  });

  it("limits challenge minting with a fixed-window counter", () => {
    const limiter = new FixedWindowRateLimiter(2, 1_000);

    expect(limiter.check("client-a", 1_000)).toBe(true);
    expect(limiter.check("client-a", 1_100)).toBe(true);
    expect(limiter.check("client-a", 1_200)).toBe(false);
    expect(limiter.check("client-a", 2_001)).toBe(true);
    expect(limiter.check("client-b", 2_001)).toBe(true);
  });
});

function solve(challenge: string, difficulty: number): string {
  for (let i = 0; i < 100_000; i++) {
    const nonce = i.toString(36);
    const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
    if (countLeadingZeroBits(digest) >= difficulty) {
      return nonce;
    }
  }
  throw new Error("Unable to solve test challenge");
}
