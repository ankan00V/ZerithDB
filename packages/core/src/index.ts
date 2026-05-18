// ─────────────────────────────────────────────────────────────────────────────
// zerithdb-core — Public API
// ─────────────────────────────────────────────────────────────────────────────

export { EventEmitter } from "./internal/event-emitter.js";
export { ZerithDBError, ErrorCode } from "zerithdb-errors";
export { Logger } from "./internal/logger.js";
export type {
  ZerithDBConfig,
  SyncConfig,
  AuthConfig,
  NetworkConfig,
  DebugConfig,
} from "./types/config.js";
export type {
  Document,
  DocumentId,
  CollectionName,
  QueryFilter,
  QueryOptions,
  UpdateSpec,
  InsertResult,
  FindResult,
} from "./types/db.js";
export type {
  PeerId,
  PeerInfo,
  RoomId,
  NetworkMessage,
  MediaStreamKind,
  MediaTrackMetadata,
  MediaStreamMetadata,
} from "./types/network.js";
export type { Identity, PublicKey, Signature } from "./types/auth.js";

export type {
  SyncUpdate,
  SyncState,
  AwarenessState,
  SyncPlugin,
  EphemeralPeerState,
  ActiveSpeakerState,
  VideoParticipantState,
} from "./types/sync.js";

export type {
  GraphNode,
  GraphEdge,
  GraphNodeId,
  EdgeLabel,
  GraphTraversalResult,
} from "./types/graph.js";
