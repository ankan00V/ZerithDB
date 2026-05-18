import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isPlainObject,
  assertDefined,
  bytesToHex,
  hexToBytes,
  bytesToBase64,
  base64ToBytes,
  sleep,
  backoffDelay,
  withTimeout,
  randomId,
} from "./index";

// ─── isPlainObject ────────────────────────────────────────────────────────────

describe("isPlainObject", () => {
  it("returns true for a plain object", () => {
    expect(isPlainObject({ a: 1 })).toBe(true);
  });

  it("returns true for an empty object", () => {
    expect(isPlainObject({})).toBe(true);
  });

  it("returns false for null", () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isPlainObject(undefined)).toBe(false);
  });

  it("returns false for an array", () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it("returns false for a string", () => {
    expect(isPlainObject("hello")).toBe(false);
    expect(isPlainObject("")).toBe(false);
  });

  it("returns false for a number", () => {
    expect(isPlainObject(0)).toBe(false);
    expect(isPlainObject(Infinity)).toBe(false);
    expect(isPlainObject(NaN)).toBe(false);
  });

  it("returns false for a boolean", () => {
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(false)).toBe(false);
  });

  it("returns false for a function", () => {
    expect(isPlainObject(() => {})).toBe(false);
  });

  it("returns true for an object with a null prototype", () => {
    expect(isPlainObject(Object.create(null))).toBe(true);
  });
});

// ─── assertDefined ────────────────────────────────────────────────────────────

describe("assertDefined", () => {
  it("does not throw for a valid string", () => {
    expect(() => assertDefined("hello", "should not throw")).not.toThrow();
  });

  it("does not throw for 0 (falsy but defined)", () => {
    expect(() => assertDefined(0, "should not throw")).not.toThrow();
  });

  it("does not throw for false (falsy but defined)", () => {
    expect(() => assertDefined(false, "should not throw")).not.toThrow();
  });

  it("does not throw for an empty string (falsy but defined)", () => {
    expect(() => assertDefined("", "should not throw")).not.toThrow();
  });

  it("throws ZerithDBError with ASSERTION_FAILED for null", () => {
    let caught: unknown;
    try {
      assertDefined(null, "value is null");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
    expect((caught as any).code).toBe("ASSERTION_FAILED");
    expect((caught as any).message).toBe("value is null");
  });

  it("throws ZerithDBError with ASSERTION_FAILED for undefined", () => {
    let caught: unknown;
    try {
      assertDefined(undefined, "value is undefined");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
    expect((caught as any).code).toBe("ASSERTION_FAILED");
  });

  it("carries the custom message in the thrown error", () => {
    let caught: unknown;
    try {
      assertDefined(null, "my custom message");
    } catch (err) {
      caught = err;
    }
    expect((caught as any).message).toBe("my custom message");
  });
});

// ─── bytesToHex ───────────────────────────────────────────────────────────────

describe("bytesToHex", () => {
  it("converts a known byte array to hex", () => {
    expect(bytesToHex(new Uint8Array([0, 1, 255]))).toBe("0001ff");
  });

  it("zero-pads single-digit hex values", () => {
    expect(bytesToHex(new Uint8Array([0x0a]))).toBe("0a");
  });

  it("returns an empty string for an empty array", () => {
    expect(bytesToHex(new Uint8Array([]))).toBe("");
  });

  it("handles all-zero bytes", () => {
    expect(bytesToHex(new Uint8Array([0, 0, 0]))).toBe("000000");
  });

  it("handles all-max bytes (0xff)", () => {
    expect(bytesToHex(new Uint8Array([255, 255, 255]))).toBe("ffffff");
  });
});

// ─── hexToBytes ───────────────────────────────────────────────────────────────

describe("hexToBytes", () => {
  it("converts a known hex string to bytes", () => {
    expect(hexToBytes("0001ff")).toEqual(new Uint8Array([0, 1, 255]));
  });

  it("returns an empty Uint8Array for an empty string", () => {
    expect(hexToBytes("")).toEqual(new Uint8Array([]));
  });

  it("throws ZerithDBError with INVALID_HEX_STRING for odd-length hex", () => {
    let caught: unknown;
    try {
      hexToBytes("abc");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
    expect((caught as any).code).toBe("INVALID_HEX_STRING");
  });

  it("throws for a single character", () => {
    let caught: unknown;
    try {
      hexToBytes("a");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
  });

  it("is the inverse of bytesToHex", () => {
    const original = new Uint8Array([72, 101, 108, 108, 111]);
    expect(hexToBytes(bytesToHex(original))).toEqual(original);
  });
});

// ─── bytesToBase64 / base64ToBytes ────────────────────────────────────────────

describe("Base64 Utilities", () => {
  it("encodes and decodes a known value", () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    expect(bytesToBase64(bytes)).toBe("SGVsbG8=");
    expect(base64ToBytes("SGVsbG8=")).toEqual(bytes);
  });

  it("returns an empty string for an empty array", () => {
    expect(bytesToBase64(new Uint8Array([]))).toBe("");
  });

  it("roundtrips an empty array", () => {
    const empty = new Uint8Array([]);
    expect(base64ToBytes(bytesToBase64(empty))).toEqual(empty);
  });

  it("roundtrips a single byte (0x00)", () => {
    const bytes = new Uint8Array([0]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("roundtrips a single byte (0xff)", () => {
    const bytes = new Uint8Array([255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it("handles a large array (>100KB) without stack overflow", () => {
    const size = 200 * 1024;
    const bytes = new Uint8Array(size).map((_, i) => i % 256);
    const b64 = bytesToBase64(bytes);
    expect(base64ToBytes(b64)).toEqual(bytes);
  });

  it("throws on invalid base64 input", () => {
    expect(() => base64ToBytes("not-valid-base64!!!")).toThrow();
  });
});

// ─── sleep ────────────────────────────────────────────────────────────────────

describe("sleep", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves after the given duration", async () => {
    const p = sleep(1000);
    vi.advanceTimersByTime(1000);
    await expect(p).resolves.toBeUndefined();
  });

  it("does not resolve before the duration", async () => {
    let resolved = false;
    sleep(500).then(() => {
      resolved = true;
    });
    vi.advanceTimersByTime(499);
    await Promise.resolve();
    expect(resolved).toBe(false);
  });

  it("resolves for 0ms", async () => {
    const p = sleep(0);
    vi.advanceTimersByTime(0);
    await expect(p).resolves.toBeUndefined();
  });
});

// ─── backoffDelay ─────────────────────────────────────────────────────────────

describe("backoffDelay", () => {
  it("returns a number", () => {
    expect(typeof backoffDelay(0)).toBe("number");
  });

  it("result is within [base/2, base] for attempt 0 (no jitter ceiling exceeded)", () => {
    for (let i = 0; i < 20; i++) {
      const delay = backoffDelay(0);
      expect(delay).toBeGreaterThanOrEqual(500);
      expect(delay).toBeLessThanOrEqual(1000);
    }
  });

  it("is capped at the max value", () => {
    for (let i = 0; i < 20; i++) {
      const delay = backoffDelay(100);
      expect(delay).toBeLessThanOrEqual(30_000);
      expect(delay).toBeGreaterThanOrEqual(15_000);
    }
  });

  it("respects a custom base and max", () => {
    for (let i = 0; i < 20; i++) {
      const delay = backoffDelay(0, 200, 400);
      expect(delay).toBeGreaterThanOrEqual(100);
      expect(delay).toBeLessThanOrEqual(200);
    }
  });

  it("increases (stochastically) as attempt grows", () => {
    const avg = (attempt: number) =>
      Array.from({ length: 50 }, () => backoffDelay(attempt)).reduce((a, b) => a + b, 0) / 50;
    expect(avg(5)).toBeGreaterThan(avg(0));
  });

  it("never returns a negative value", () => {
    for (let i = 0; i < 20; i++) {
      expect(backoffDelay(0)).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── withTimeout ──────────────────────────────────────────────────────────────

describe("withTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolves with the fn result when it completes in time", async () => {
    const p = withTimeout(() => Promise.resolve(42), 1000);
    vi.advanceTimersByTime(0);
    await expect(p).resolves.toBe(42);
  });

  it("rejects with ZerithDBError TIMEOUT_EXCEEDED when fn is too slow", async () => {
    const slow = () => new Promise<never>(() => {});
    const p = withTimeout(slow, 500, "took too long");
    vi.advanceTimersByTime(500);
    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
    expect((caught as any).code).toBe("TIMEOUT_EXCEEDED");
    expect((caught as any).message).toBe("took too long");
  });

  it("uses the default timeout message when none is provided", async () => {
    const slow = () => new Promise<never>(() => {});
    const p = withTimeout(slow, 100);
    vi.advanceTimersByTime(100);
    let caught: unknown;
    try {
      await p;
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect((caught as any).name).toBe("ZerithDBError");
    expect((caught as any).message).toBe("Operation timed out");
  });

  it("propagates errors thrown by fn itself", async () => {
    const failing = () => Promise.reject(new Error("fn failed"));
    const p = withTimeout(failing, 1000);
    vi.advanceTimersByTime(0);
    await expect(p).rejects.toThrow("fn failed");
  });
});

// ─── randomId ─────────────────────────────────────────────────────────────────

describe("randomId", () => {
  it("returns a string", () => {
    expect(typeof randomId()).toBe("string");
  });

  it("matches the UUID v4 format", () => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(randomId()).toMatch(uuidRegex);
  });

  it("generates unique values on each call", () => {
    const ids = new Set(Array.from({ length: 100 }, () => randomId()));
    expect(ids.size).toBe(100);
  });
});
