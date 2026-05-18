/**
 * Enumeration of all structured error codes in ZerithDB.
 * Use these to handle specific error conditions in application code.
 */
export enum ErrorCode {
  // Database errors
  DB_INIT_FAILED = "DB_INIT_FAILED",
  DB_WRITE_FAILED = "DB_WRITE_FAILED",
  DB_READ_FAILED = "DB_READ_FAILED",
  DB_DELETE_FAILED = "DB_DELETE_FAILED",
  DB_MIGRATION_FAILED = "DB_MIGRATION_FAILED",
  DB_QUOTA_EXCEEDED = "DB_QUOTA_EXCEEDED",

  // Sync errors
  SYNC_INIT_FAILED = "SYNC_INIT_FAILED",
  SYNC_APPLY_FAILED = "SYNC_APPLY_FAILED",
  SYNC_ENCODE_FAILED = "SYNC_ENCODE_FAILED",

  // Network errors
  NETWORK_SIGNALING_FAILED = "NETWORK_SIGNALING_FAILED",
  NETWORK_PEER_TIMEOUT = "NETWORK_PEER_TIMEOUT",
  NETWORK_PEER_DISCONNECTED = "NETWORK_PEER_DISCONNECTED",
  NETWORK_WEBRTC_FAILED = "NETWORK_WEBRTC_FAILED",
  NETWORK_TRANSPORT_DOWNGRADE = "NETWORK_TRANSPORT_DOWNGRADE",

  // Auth errors
  AUTH_KEY_GENERATION_FAILED = "AUTH_KEY_GENERATION_FAILED",
  AUTH_SIGN_FAILED = "AUTH_SIGN_FAILED",
  AUTH_VERIFY_FAILED = "AUTH_VERIFY_FAILED",
  AUTH_INVALID_SIGNATURE = "AUTH_INVALID_SIGNATURE",
  AUTH_KEY_NOT_FOUND = "AUTH_KEY_NOT_FOUND",

  // SDK / config errors
  SDK_INVALID_CONFIG = "SDK_INVALID_CONFIG",
  SDK_NOT_INITIALIZED = "SDK_NOT_INITIALIZED",
  SDK_UNSUPPORTED_ENVIRONMENT = "SDK_UNSUPPORTED_ENVIRONMENT",
  // Utility and core errors
  ASSERTION_FAILED = "ASSERTION_FAILED",
  INVALID_HEX_STRING = "INVALID_HEX_STRING",
  TIMEOUT_EXCEEDED = "TIMEOUT_EXCEEDED",
}

/**
 * Typed error class for all ZerithDB errors.
 * Carries a structured {@link ErrorCode} for programmatic handling.
 *
 * @example
 * ```typescript
 * try {
 *   await app.db("todos").insert(doc);
 * } catch (err) {
 *   if (
 *     err instanceof ZerithDBError &&
 *     err.code === ErrorCode.DB_QUOTA_EXCEEDED
 *   ) {
 *     // handle storage full
 *   }
 * }
 * ```
 */
export class ZerithDBError extends Error {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);

    this.name = "ZerithDBError";
    this.code = code;

    // Maintains proper prototype chain in older environments
    Object.setPrototypeOf(this, new.target.prototype);
  }

  override toString(): string {
    return `${this.name} [${this.code}]: ${this.message}`;
  }
}
