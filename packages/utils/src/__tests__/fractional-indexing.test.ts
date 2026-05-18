import { describe, it, expect } from "vitest";
import { generateKeyBetween, rebalanceKeys } from "../index.js";

describe("fractional-indexing core utilities", () => {
  describe("generateKeyBetween()", () => {
    it("generates a middle key when both bounds are null", () => {
      expect(generateKeyBetween(null, null)).toBe("m");
    });

    it("generates a key between null and a string", () => {
      const result = generateKeyBetween(null, "m");
      expect(result).toBe("f");
      expect(result < "m").toBe(true);
    });

    it("generates a key between a string and null", () => {
      const result = generateKeyBetween("m", null);
      expect(result).toBe("t");
      expect("m" < result).toBe(true);
    });

    it("generates a key between two strings with room", () => {
      const result = generateKeyBetween("f", "m");
      expect(result).toBe("i");
      expect("f" < result && result < "m").toBe(true);
    });

    it("generates a key between two consecutive characters by extending length", () => {
      const result = generateKeyBetween("f", "g");
      expect(result).toBe("fm");
      expect("f" < result && result < "g").toBe(true);
    });

    it("handles multiple sub-insertions between consecutive values", () => {
      const result1 = generateKeyBetween("f", "fm");
      expect(result1).toBe("ff");
      expect("f" < result1 && result1 < "fm").toBe(true);

      const result2 = generateKeyBetween("ff", "fm");
      expect(result2).toBe("fi");
      expect("ff" < result2 && result2 < "fm").toBe(true);
    });

    it("throws an error if bounds are invalid (lower >= upper)", () => {
      expect(() => generateKeyBetween("m", "f")).toThrow();
      expect(() => generateKeyBetween("m", "m")).toThrow();
    });
  });

  describe("rebalanceKeys()", () => {
    it("returns empty array for non-positive counts", () => {
      expect(rebalanceKeys(0)).toEqual([]);
      expect(rebalanceKeys(-5)).toEqual([]);
    });

    it("generates a single key array", () => {
      expect(rebalanceKeys(1)).toEqual(["m"]);
    });

    it("generates deterministic, ascending key sequences", () => {
      const keys = rebalanceKeys(5);
      expect(keys.length).toBe(5);
      
      // Ensure all keys are strictly ascending
      for (let i = 0; i < keys.length - 1; i++) {
        expect(keys[i] < keys[i + 1]).toBe(true);
      }
    });
  });
});
