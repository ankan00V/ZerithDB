import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha2.js";
import { countLeadingZeroBits, fetchSignalingProofOfWork, solveHashcashChallenge } from "./pow.js";

const textEncoder = new TextEncoder();

describe("network proof of work", () => {
  it("solves a hashcash challenge at the requested difficulty", async () => {
    const solution = await solveHashcashChallenge({
      challenge: "test-challenge",
      difficulty: 8,
      yieldInterval: 0,
    });

    expect(solution.challenge).toBe("test-challenge");
    expect(solution.nonce).toContain("-");
    expect(solution.iterations).toBeGreaterThan(0);
    expect(
      countLeadingZeroBits(sha256(textEncoder.encode(`${solution.challenge}:${solution.nonce}`)))
    ).toBeGreaterThanOrEqual(8);
  });

  it("fetches a signaling challenge and returns a solution", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            required: true,
            algorithm: "hashcash-sha256",
            challenge: "server-challenge",
            difficulty: 0,
            expiresAt: Date.now() + 60_000,
          }),
          { status: 200 }
        )
    ) as unknown as typeof fetch;

    const solution = await fetchSignalingProofOfWork({
      baseUrl: "https://signal.example.test",
      roomId: "room-a",
      peerId: "peer-a",
      fetchImpl,
    });

    expect(solution?.challenge).toBe("server-challenge");
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://signal.example.test/pow/challenge?room=room-a&peer=peer-a",
      { method: "GET" }
    );
  });

  it("returns null when proof of work is disabled or unsupported", async () => {
    const disabledFetch = vi.fn(async () => new Response(JSON.stringify({ required: false })));
    const missingFetch = vi.fn(async () => new Response(null, { status: 404 }));
    const failedFetch = vi.fn(async () => {
      throw new TypeError("network failed");
    });

    await expect(
      fetchSignalingProofOfWork({
        baseUrl: "https://signal.example.test",
        roomId: "room-a",
        peerId: "peer-a",
        fetchImpl: disabledFetch as unknown as typeof fetch,
      })
    ).resolves.toBeNull();
    await expect(
      fetchSignalingProofOfWork({
        baseUrl: "https://signal.example.test",
        roomId: "room-a",
        peerId: "peer-a",
        fetchImpl: missingFetch as unknown as typeof fetch,
      })
    ).resolves.toBeNull();
    await expect(
      fetchSignalingProofOfWork({
        baseUrl: "https://signal.example.test",
        roomId: "room-a",
        peerId: "peer-a",
        fetchImpl: failedFetch as unknown as typeof fetch,
      })
    ).resolves.toBeNull();
  });

  it("rejects expired challenge responses before solving", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            required: true,
            algorithm: "hashcash-sha256",
            challenge: "server-challenge",
            difficulty: 0,
            expiresAt: Date.now() - 1,
          })
        )
    ) as unknown as typeof fetch;

    await expect(
      fetchSignalingProofOfWork({
        baseUrl: "https://signal.example.test",
        roomId: "room-a",
        peerId: "peer-a",
        fetchImpl,
      })
    ).rejects.toThrow("already expired");
  });

  it("stops solving when a challenge expires mid-loop", async () => {
    await expect(
      solveHashcashChallenge({
        challenge: "slow-challenge",
        difficulty: 30,
        expiresAt: Date.now() - 1,
        yieldInterval: 0,
        maxIterations: 10,
      })
    ).rejects.toThrow("expired");
  });

  it("counts leading zero bits exactly", () => {
    expect(countLeadingZeroBits(new Uint8Array([0, 0b0001_1111]))).toBe(11);
    expect(countLeadingZeroBits(new Uint8Array([0b1000_0000]))).toBe(0);
  });
});
