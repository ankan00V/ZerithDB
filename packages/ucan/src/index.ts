export { UCANIssuer } from "./token.js";
export { UCANVerifier } from "./verifier.js";
export { CapabilityBlocklist } from "./blocklist.js";
export { UCANSyncPlugin } from "./plugin.js";
export { findMatchingCapability, isAbilityGranted } from "./token.js";
export type {
  UCANAbility,
  UCANCapability,
  UCANHeader,
  UCANPayload,
  UCANResource,
  UCANRole,
  UCANToken,
  UCANVerifyResult,
} from "./types.js";
export { ROLE_ABILITIES } from "./types.js";