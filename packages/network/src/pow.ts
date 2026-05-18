import { sha256 } from "@noble/hashes/sha2.js";

const POW_ALGORITHM = "hashcash-sha256";
const DEFAULT_MAX_ITERATIONS = 5_000_000;
const DEFAULT_YIELD_INTERVAL = 4096;
const textEncoder = new TextEncoder();

export interface ProofOfWorkSolution {
  challenge: string;
  nonce: string;
}

export interface ProofOfWorkSolveStats extends ProofOfWorkSolution {
  difficulty: number;
  elapsedMs: number;
  iterations: number;
}

interface ChallengeResponse {
  required?: boolean;
  algorithm?: string;
  challenge?: string;
  difficulty?: number;
  expiresAt?: number;
}

export async function fetchSignalingProofOfWork(params: {
  baseUrl: string;
  roomId: string;
  peerId: string;
  fetchImpl?: typeof fetch;
  maxIterations?: number;
}): Promise<ProofOfWorkSolution | null> {
  const fetcher = params.fetchImpl ?? fetch;
  const challengeUrl = new URL("/pow/challenge", params.baseUrl);
  challengeUrl.searchParams.set("room", params.roomId);
  challengeUrl.searchParams.set("peer", params.peerId);

  let res: Response;
  try {
    res = await fetcher(challengeUrl.toString(), { method: "GET" });
  } catch {
    return null;
  }
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Proof-of-work challenge failed: ${res.status} ${res.statusText}`);
  }

  const challenge = (await res.json()) as ChallengeResponse;
  if (challenge.required === false) {
    return null;
  }
  if (
    challenge.algorithm !== POW_ALGORITHM ||
    typeof challenge.challenge !== "string" ||
    typeof challenge.difficulty !== "number" ||
    !Number.isInteger(challenge.difficulty) ||
    challenge.difficulty < 0 ||
    challenge.difficulty > 30 ||
    typeof challenge.expiresAt !== "number"
  ) {
    throw new Error("Proof-of-work challenge response was invalid");
  }
  if (challenge.expiresAt <= Date.now()) {
    throw new Error("Proof-of-work challenge already expired");
  }

  return solveHashcashChallenge({
    challenge: challenge.challenge,
    difficulty: challenge.difficulty,
    expiresAt: challenge.expiresAt,
    maxIterations: params.maxIterations,
  });
}

export async function solveHashcashChallenge(params: {
  challenge: string;
  difficulty: number;
  maxIterations?: number;
  yieldInterval?: number;
  expiresAt?: number;
}): Promise<ProofOfWorkSolveStats> {
  const difficulty = Math.max(0, Math.floor(params.difficulty));
  const maxIterations = params.maxIterations ?? DEFAULT_MAX_ITERATIONS;
  const yieldInterval = params.yieldInterval ?? DEFAULT_YIELD_INTERVAL;
  const noncePrefix = randomNoncePrefix();
  const startedAt = performance.now();

  for (let i = 0; i < maxIterations; i++) {
    const shouldCheckExpiration = yieldInterval <= 0 || i % yieldInterval === 0;
    if (params.expiresAt !== undefined && shouldCheckExpiration && Date.now() >= params.expiresAt) {
      throw new Error("Proof-of-work challenge expired before it could be solved");
    }

    const nonce = `${noncePrefix}-${i.toString(36)}`;
    const digest = sha256(textEncoder.encode(`${params.challenge}:${nonce}`));

    if (countLeadingZeroBits(digest) >= difficulty) {
      return {
        challenge: params.challenge,
        nonce,
        difficulty,
        elapsedMs: performance.now() - startedAt,
        iterations: i + 1,
      };
    }

    if (yieldInterval > 0 && i > 0 && i % yieldInterval === 0) {
      await yieldToBrowser();
    }
  }

  throw new Error(`Proof-of-work solve exceeded ${maxIterations} attempts`);
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

function randomNoncePrefix(): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
