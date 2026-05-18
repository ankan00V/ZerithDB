export interface SyncConfig {
  /**
   * WebSocket URL of the ZerithDB signaling server.
   * @default "wss://signal.zerithdb.dev"
   */
  signalingUrl?: string;

  /**
   * Multiple signaling server URLs for automatic failover.
   * Tried in order — falls back to the next on failure.
   * Takes priority over signalingUrl if both are set.
   */
  signalingUrls?: string[];

  /**
   * STUN/TURN server URLs for WebRTC ICE negotiation.
   * @default Uses Google's public STUN servers
   */
  iceServers?: RTCIceServer[];

  /**
   * Maximum number of peers to connect to per room.
   * Full-mesh topology — costs O(n²) connections.
   * @default 10
   */
  maxPeers?: number;
/**
 * Delay between sync broadcasts in ms.
 * Helps batch rapid Yjs updates together.
 * @default 100
 */
updateThrottleMs?: number;

/**
 * Signaling transport preference.
 * - `"auto"`      — Try WebSocket first, fall back to HTTP long-polling (default)
 * - `"websocket"` — WebSocket only (original behavior)
 * - `"polling"`   — HTTP long-polling only (for strict firewall environments)
 * @default "auto"
 */
transport?: "auto" | "websocket" | "polling";

/**
 * Configuration options for low-latency ephemeral sync state.
 */
ephemeral?: EphemeralConfig;
}

export interface EphemeralConfig {
  cleanupIntervalMs?: number;
  throttleMs?: number;
  staleAfterMs?: number;

}

export interface AuthConfig {
  /**
   * Storage key prefix for the identity keypair in localStorage.
   * @default "__zerithdb_identity"
   */
  storageKey?: string;
}

export interface DebugConfig {
  /**
   * Enable the DevTools memory collector — samples IndexedDB and WebRTC
   * buffer usage and broadcasts snapshots for the ZerithDB DevTools extension.
   * @default false
   */
  devtools?: boolean;
}

export interface NetworkConfig {
  /**
   * Whether to automatically reconnect when a peer disconnects.
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Initial backoff delay in ms for reconnection.
   * @default 1000
   */
  reconnectDelay?: number;
  /** Optional human-readable peer alias */
  name?: string;

  /** Optional ENS identity */
  ens?: string;
}

export interface ZerithDBConfig {
  /**
   * Unique identifier for this application's data namespace.
   * This scopes all IndexedDB storage and P2P rooms.
   * Must be stable — changing it is equivalent to starting fresh.
   */
  appId: string;

  sync?: SyncConfig;
  auth?: AuthConfig;
  network?: NetworkConfig;
  debug?: DebugConfig;

  /**
   * Log level for internal ZerithDB diagnostics.
   * @default "warn"
   */
  logLevel?: "debug" | "info" | "warn" | "error" | "silent";
}
