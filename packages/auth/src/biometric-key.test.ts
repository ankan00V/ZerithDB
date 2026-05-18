import { describe, it, expect, beforeEach, vi } from "vitest";
import { BiometricKeyManager } from "./biometric-key.js";
import { ZerithDBError, ErrorCode } from "zerithdb-core";

describe("Biometric-Bound Non-Exportable Session Keys", () => {
  let keyManager: BiometricKeyManager;

  beforeEach(() => {
    keyManager = new BiometricKeyManager();
  });

  describe("Biometric Hardware Checks", () => {
    it("should default to hardware unavailable if APIs are missing", async () => {
      const isSupported = await keyManager.isBiometricSupported();
      expect(isSupported).toBe(false);
    });

    it("should honor mock biometric hardware availability setting", async () => {
      keyManager.setMockBiometricAvailability(true);
      expect(await keyManager.isBiometricSupported()).toBe(true);

      keyManager.setMockBiometricAvailability(false);
      expect(await keyManager.isBiometricSupported()).toBe(false);
    });
  });

  describe("Non-Exportable Session Key Lifecycle", () => {
    it("should generate a secure ECDSA key pair and enforce extractable: false", async () => {
      const keyPair = await keyManager.generateSessionKey();
      expect(keyPair).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();

      // Enforce the core security constraint
      expect(keyPair.privateKey.extractable).toBe(false);
      expect(keyManager.isBiometricEnabled()).toBe(true);
    });

    it("should sign a payload using the non-exportable key and verify it", async () => {
      await keyManager.generateSessionKey();
      const payload = new TextEncoder().encode("Hello, secure peer-to-peer sync!");

      const signature = await keyManager.sign(payload);
      expect(signature).toBeDefined();
      expect(signature.length).toBeGreaterThan(0);

      const pubKeyHex = await keyManager.getPublicKeyHex();
      expect(pubKeyHex).toBeDefined();
      expect(pubKeyHex.length).toBeGreaterThan(0);

      const isValid = await keyManager.verify(payload, signature, pubKeyHex);
      expect(isValid).toBe(true);
    });

    it("should reject verification if payload was tampered with", async () => {
      await keyManager.generateSessionKey();
      const payload = new TextEncoder().encode("Original Sync Payload");
      const tamperedPayload = new TextEncoder().encode("Tampered Sync Payload");

      const signature = await keyManager.sign(payload);
      const pubKeyHex = await keyManager.getPublicKeyHex();

      const isValid = await keyManager.verify(tamperedPayload, signature, pubKeyHex);
      expect(isValid).toBe(false);
    });
  });

  describe("Biometric Prompt and Fallbacks", () => {
    it("should trigger custom prompt handler when biometric verification is requested", async () => {
      keyManager.setMockBiometricAvailability(true);

      const promptMock = vi.fn().mockResolvedValue(true);
      keyManager.setPromptHandler(promptMock);

      const success = await keyManager.promptBiometric("Authorize deletion");
      expect(promptMock).toHaveBeenCalledWith("Authorize deletion");
      expect(success).toBe(true);
    });

    it("should trigger fallback handler if biometric hardware is unavailable", async () => {
      keyManager.setMockBiometricAvailability(false);

      const fallbackMock = vi.fn().mockResolvedValue(true);
      keyManager.setFallbackHandler(fallbackMock);

      const success = await keyManager.promptBiometric("Authorize database write");
      expect(fallbackMock).toHaveBeenCalledWith("Authorize database write");
      expect(success).toBe(true);
    });

    it("should handle prompt cancellations or rejections gracefully", async () => {
      keyManager.setMockBiometricAvailability(true);

      const promptMock = vi.fn().mockResolvedValue(false);
      keyManager.setPromptHandler(promptMock);

      const success = await keyManager.promptBiometric("Authorize export");
      expect(success).toBe(false);
    });
  });
});
