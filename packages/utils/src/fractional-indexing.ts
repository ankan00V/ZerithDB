/**
 * String-based fractional indexing algorithm (lexical midpoint allocation).
 * Allows infinite sequential insertion between any two strings without integer collision.
 * Aligns with Figma's lexical approach using the lowercase english alphabet 'a' to 'z'.
 */
import { ZerithDBError, ErrorCode } from "zerithdb-errors";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz";
const BASE = ALPHABET.length;
const MIDPOINT_CHAR = "m"; // Midpoint of 'a'-'z'

/**
 * Generates a lexicographically sortable string key strictly between `a` and `b`.
 * If `a` is null, returns a key smaller than `b`.
 * If `b` is null, returns a key larger than `a`.
 * If both are null, returns the default starting midpoint ("m").
 *
 * @param a - Lower bound string (or null if start of list)
 * @param b - Upper bound string (or null if end of list)
 * @returns A string strictly between a and b lexicographically
 */
export function generateKeyBetween(a: string | null, b: string | null): string {
  // Validate that a is lexicographically smaller than b if both are specified
  if (a !== null && b !== null && a >= b) {
    throw new ZerithDBError(
      ErrorCode.ASSERTION_FAILED,
      `Invalid bounds: lower bound "${a}" must be lexicographically less than upper bound "${b}"`
    );
  }

  const first = a ?? "";
  const second = b ?? "";

  let i = 0;
  while (true) {
    // Convert character at index i to index (0-25). 
    // If index i exceeds string length, lower bound defaults to -1 (virtual start),
    // upper bound defaults to 26 (virtual end).
    const charA = first.charCodeAt(i) - 97;
    const charB = second.charCodeAt(i) - 97;

    const valA = Number.isNaN(charA) ? -1 : charA;
    const valB = Number.isNaN(charB) ? BASE : charB;

    // Check if there is room for at least one character between valA and valB
    if (valB - valA > 1) {
      const mid = Math.floor((valA + valB) / 2);
      return first.slice(0, i) + String.fromCharCode(mid + 97);
    }

    // No room in this position; either valA and valB are equal, or consecutive (valB - valA === 1)
    // Continue scanning to the next character index
    i++;
  }
}

/**
 * Generates an array of `count` evenly-spaced fractional index keys.
 * Used for deterministic rebalancing and initializing list indexes.
 *
 * @param count - Number of keys to generate
 * @returns Array of evenly-spaced sortable strings
 */
export function rebalanceKeys(count: number): string[] {
  if (count <= 0) return [];
  
  const keys: string[] = [];
  let prev: string | null = null;
  
  for (let i = 0; i < count; i++) {
    const key = generateKeyBetween(prev, null);
    keys.push(key);
    prev = key;
  }
  
  return keys;
}
