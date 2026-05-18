/**
 * zerithdb-utils — Internal shared utilities
 * Not for public consumption. Not exported from zerithdb-sdk.
 */
import { ZerithDBError, ErrorCode } from "zerithdb-errors";

// ─── Type guards ──────────────────────────────────────────────────────────────

/**
 * Checks whether a value is a plain object.
 *
 * @param {unknown} value - Value to check.
 * @returns {boolean} Returns true if the value is a plain object.
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Ensures that a value is neither null nor undefined.
 *
 * @param value - Value to validate.
 * @param {string} message - Error message to throw if validation fails.
 * @throws {Error} Throws an error if the value is null or undefined.
 */
export function assertDefined<T>(value: T | null | undefined, message: string): asserts value is T {
  if (value === null || value === undefined) {
    throw new ZerithDBError(ErrorCode.ASSERTION_FAILED, message);
  }
}

// ─── Encoding helpers ─────────────────────────────────────────────────────────

/**
 * Converts a Uint8Array into a hexadecimal string.
 *
 * @param {Uint8Array} bytes - Byte array to convert.
 * @returns {string} Hexadecimal string representation.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Converts a hexadecimal string into a Uint8Array.
 *
 * @param {string} hex - Hexadecimal string to convert.
 * @returns {Uint8Array} Converted byte array.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0)
    throw new ZerithDBError(ErrorCode.INVALID_HEX_STRING, "Invalid hex string length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Encodes a Uint8Array into a Base64 string.
 *
 * @param {Uint8Array} bytes - Byte array to encode.
 * @returns {string} Base64 encoded string.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use chunking to avoid call stack overflow on large arrays (>~100KB)
  const CHUNK_SIZE = 0x4000; // 16KB
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string into a Uint8Array.
 *
 * @param {string} b64 - Base64 string to decode.
 * @returns {Uint8Array} Decoded byte array.
 */
export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

// ─── Async helpers ────────────────────────────────────────────────────────────

/**
 * Delays execution for a specified duration.
 *
 * @param {number} ms - Delay duration in milliseconds.
 * @returns {Promise<void>} Promise resolved after the delay.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay for retry attempts.
 *
 * @param {number} attempt - Current retry attempt number.
 * @returns {number} Delay duration in milliseconds.
 */
export function backoffDelay(attempt: number, base = 1000, max = 30_000): number {
  const exp = Math.min(base * 2 ** attempt, max);
  return exp / 2 + Math.random() * (exp / 2); // full jitter
}

/**
 * Wraps a promise with a timeout limit.
 *
 * @param {Promise<T>} promise - Promise to execute.
 * @param {number} timeout - Timeout duration in milliseconds.
 * @param {string} message - Error message for timeout failure.
 * @returns {Promise<T>} Resolved promise result.
 * @throws {Error} Throws an error if the operation exceeds the timeout duration.
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  timeoutMessage = "Operation timed out"
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new ZerithDBError(ErrorCode.TIMEOUT_EXCEEDED, timeoutMessage)), ms)
    ),
  ]);
}

// ─── ID helpers ───────────────────────────────────────────────────────────────

/**
 * Generates a random unique identifier.
 *
 * @returns {string} Randomly generated identifier.
 */
export function randomId(): string {
  return crypto.randomUUID();
}

// ─── Fractional Indexing helpers ──────────────────────────────────────────────

export { generateKeyBetween, rebalanceKeys } from "./fractional-indexing.js";

