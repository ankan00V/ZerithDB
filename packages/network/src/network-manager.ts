import SimplePeer from "simple-peer";
import type {
  ZerithDBConfig,
  PeerId,
  PeerInfo,
  MediaStreamKind,
  MediaStreamMetadata,
} from "zerithdb-core";
import { EventEmitter, ZerithDBError, ErrorCode } from "zerithdb-core";
import type { AuthManager } from "zerithdb-auth";
import type { SignalingTransport } from "./signaling-transport.js";
import { WebSocketTransport } from "./transports/websocket-transport.js";
import { PollingTransport } from "./transports/polling-transport.js";
import { NameRegistry } from "./name-registry.js";
import { MockENSResolver } from "./ens-resolver";
import { fetchSignalingProofOfWork } from "./pow.js";

export interface WebRtcBufferStats {
  peerCount: number;
  bufferedBytes: number;
  peers: Array<{ peerId: PeerId; bufferedAmount: number }>;
}

/** simple-peer exposes the underlying RTCDataChannel as a private field */
interface SimplePeerWithChannel {
  connected: boolean;
  _channel?: RTCDataChannel;
}

type NetworkEvents = {
  "peer:connected": PeerInfo;
  "peer:disconnected": { peerId: PeerId };
  message: { type: string; payload: Uint8Array | string; from: PeerId };
  "media:stream": { peerId: PeerId; stream: MediaStream; metadata?: MediaStreamMetadata };
  "media:track": { peerId: PeerId; track: MediaStreamTrack; stream: MediaStream };
  "media:stream:metadata": { peerId: PeerId; metadata: MediaStreamMetadata };
  "media:stream:removed": { peerId: PeerId; streamId: string };
  error: { peerId: PeerId; error: Error };
  "transport:downgrade": { from: "websocket"; to: "polling"; reason: string };
  announcement: string;
};

export type MediaStreamMetadataInput = Partial<
  Omit<
    MediaStreamMetadata,
    "streamId" | "peerId" | "tracks" | "audioMuted" | "videoMuted" | "updatedAt"
  >
> & { kind?: MediaStreamKind };

interface SignalingMessage {
  type: "offer" | "answer" | "ice-candidate" | "peer-list" | "announcement";
  from: string;
  to?: string;
  payload: unknown;

  name?: string; // human-readable alias (alice.zerith)
  ens?: string; // optional ENS name
}

const DEFAULT_SIGNALING_URL = "wss://arpitkhandelwal810-zerith-signaling.hf.space";

/**
 * Manages WebRTC peer-to-peer connections for a ZerithDB app.
 *
 * Architecture: Full mesh — every peer connects to every other peer.
 * The signaling server only handles the initial WebRTC handshake (ICE/SDP).
 * After that, all data flows peer-to-peer over encrypted WebRTC data channels.
 *
 * Supports automatic transport fallback: if WebSocket signaling is blocked
 * (e.g. by corporate firewalls), the manager transparently downgrades to
 * HTTP long-polling.
 *
 * Supports multiple signaling server URLs with automatic failover:
 * if one server fails, the next URL in the list is tried automatically.
 */
export class NetworkManager extends EventEmitter<NetworkEvents> {
  private transport: SignalingTransport | null = null;
  private activeTransportType: "websocket" | "polling" | null = null;
  private readonly peers = new Map<PeerId, SimplePeer.Instance>();
  private readonly peerInfo = new Map<PeerId, PeerInfo>();
  private readonly peerIdentity = new Map<PeerId, { name?: string; ens?: string }>();
  private readonly localStreams = new Map<string, MediaStream>();
  private readonly localStreamMetadata = new Map<string, MediaStreamMetadata>();
  private readonly remoteStreams = new Map<PeerId, Map<string, MediaStream>>();
  private readonly remoteStreamMetadata = new Map<PeerId, Map<string, MediaStreamMetadata>>();
  private localPeerId: PeerId = crypto.randomUUID();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private disposed = false;
  private currentUrlIndex = 0;
  private readonly nameRegistry = new NameRegistry();
  private ensResolver: MockENSResolver;

  constructor(
    private readonly config: ZerithDBConfig,
    private readonly auth: AuthManager
  ) {
    super();

    this.ensResolver = new MockENSResolver();
  }

  getName(peerId: string) {
    return this.nameRegistry.entries().find((r) => r.peerId === peerId);
  }

  resolveName(name: string) {
    return this.nameRegistry.resolve(name);
  }

  get peerId(): PeerId {
    return this.localPeerId;
  }

  /** The transport type currently in use, or null if not connected */
  get transportType(): "websocket" | "polling" | null {
    return this.activeTransportType;
  }

  /**
   * Returns the ordered list of signaling URLs to try.
   * Supports both signalingUrls (array) and signalingUrl (single).
   * Falls back to the default URL if neither is set.
   */
  private getSignalingUrls(): string[] {
    if (this.config.sync?.signalingUrls && this.config.sync.signalingUrls.length > 0) {
      return this.config.sync.signalingUrls;
    }
    return [this.config.sync?.signalingUrl ?? DEFAULT_SIGNALING_URL];
  }

  /**
   * Connect to the signaling server and join the P2P room.
   * Tries each URL in order — automatically fails over to the next on failure.
   *
   * Transport selection per URL:
   * - `"auto"` (default): Try WebSocket first, fall back to HTTP long-polling.
   * - `"websocket"`: WebSocket only.
   * - `"polling"`: HTTP long-polling only.
   */
  async connect(roomId: string): Promise<void> {
    const urls = this.getSignalingUrls();

    for (let i = 0; i < urls.length; i++) {
      const index = (this.currentUrlIndex + i) % urls.length;
      const url = urls[index];

      try {
        await this.connectToUrl(url, roomId);
        this.currentUrlIndex = index;
        return;
      } catch {
        console.warn(`[ZerithDB] Signaling server failed: ${url}. Trying next...`);
      }
    }

    throw new ZerithDBError(
      ErrorCode.NETWORK_SIGNALING_FAILED,
      `All signaling servers failed. Tried: ${urls.join(", ")}`
    );
  }

  /**
   * Try connecting to a single signaling URL using the configured transport.
   */
  private async connectToUrl(signalingUrl: string, roomId: string): Promise<void> {
    const transportPref = this.config.sync?.transport ?? "auto";

    if (transportPref === "websocket") {
      await this.connectWebSocket(signalingUrl, roomId);
    } else if (transportPref === "polling") {
      await this.connectPolling(signalingUrl, roomId);
    } else {
      // "auto" — try WebSocket first, fall back to polling
      try {
        await this.connectWebSocket(signalingUrl, roomId);
      } catch (wsError) {
        const reason = wsError instanceof Error ? wsError.message : "WebSocket connection failed";

        this.emit("transport:downgrade", {
          from: "websocket",
          to: "polling",
          reason,
        });

        console.warn(
          `[ZerithDB] WebSocket signaling failed (${reason}). ` +
            `Falling back to HTTP long-polling.`
        );

        await this.connectPolling(signalingUrl, roomId);
      }
    }
  }

  /**
   * Broadcast a message to all connected peers.
   */
  broadcast(message: { type: string; payload: string | Uint8Array }): void {
    this.signAndSendAsync(message, null);
  }

  /**
   * Send a message to a specific peer.
   */
  sendTo(peerId: PeerId, message: { type: string; payload: string | Uint8Array }): void {
    this.signAndSendAsync(message, peerId);
  }

  private async signAndSendAsync(
    message: { type: string; payload: string | Uint8Array },
    targetPeerId: PeerId | null
  ): Promise<void> {
    try {
      let finalMessage = { ...message } as any;

      if (this.auth?.biometric?.isBiometricEnabled()) {
        const payloadBytes =
          typeof message.payload === "string"
            ? new TextEncoder().encode(message.payload)
            : message.payload;

        const sigBytes = await this.auth.biometric.sign(payloadBytes);
        const signature = bytesToHex(sigBytes);
        const senderPublicKey = await this.auth.biometric.getPublicKeyHex();

        finalMessage = {
          type: message.type,
          payload: message.payload,
          signature,
          senderPublicKey,
        };
      }

      const data = JSON.stringify(finalMessage);

      if (targetPeerId === null) {
        for (const [, peer] of this.peers) {
          if (peer.connected) {
            peer.send(data);
          }
        }
      } else {
        const peer = this.peers.get(targetPeerId);
        if (peer?.connected) {
          peer.send(data);
        }
      }
    } catch (err) {
      console.error("[ZerithDB] Failed to sign/send WebRTC message:", err);
    }
  }

  /** Number of currently connected peers */
  get connectedPeerCount(): number {
    let count = 0;
    for (const [, peer] of this.peers) {
      if (peer.connected) count++;
    }
    return count;
  }

  /** List of all connected peer infos */
  get connectedPeers(): PeerInfo[] {
    return [...this.peerInfo.values()];
  }

  /**
   * Reads `bufferedAmount` from each peer's WebRTC data channel.
   * Used by the DevTools memory collector.
   */
  getBufferStats(): WebRtcBufferStats {
    const peers: WebRtcBufferStats["peers"] = [];
    let bufferedBytes = 0;

    for (const [peerId, peer] of this.peers) {
      const channel = (peer as SimplePeerWithChannel)._channel;
      if (!peer.connected || channel === undefined) continue;

      const bufferedAmount = channel.bufferedAmount;
      peers.push({ peerId, bufferedAmount });
      bufferedBytes += bufferedAmount;
    }

    return {
      peerCount: peers.length,
      bufferedBytes,
      peers,
    };
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
    }
    for (const [, peer] of this.peers) {
      peer.destroy();
    }
    this.peers.clear();
    this.peerInfo.clear();
    this.localStreams.clear();
    this.localStreamMetadata.clear();
    this.remoteStreams.clear();
    this.remoteStreamMetadata.clear();
    if (this.transport !== null) {
      this.transport.close();
      this.transport = null;
    }
    this.activeTransportType = null;
  }

  // ─── Private — Transport setup ────────────────────────────────────────────

  private async connectWebSocket(signalingUrl: string, roomId: string): Promise<void> {
    const proofOfWork = await this.createProofOfWork(signalingUrl, roomId);
    const url = new URL(signalingUrl);
    url.searchParams.set("room", roomId);
    url.searchParams.set("peer", this.localPeerId);
    if (proofOfWork !== null) {
      url.searchParams.set("powChallenge", proofOfWork.challenge);
      url.searchParams.set("powNonce", proofOfWork.nonce);
    }

    const wsTransport = new WebSocketTransport();
    await wsTransport.connect(url.toString(), 5000);

    this.attachTransport(wsTransport, roomId);
    this.activeTransportType = "websocket";
    this.reconnectAttempts = 0;
  }

  private async connectPolling(signalingUrl: string, roomId: string): Promise<void> {
    const httpUrl = this.wsUrlToHttp(signalingUrl);
    const proofOfWork = await this.createProofOfWork(signalingUrl, roomId);

    const pollTransport = new PollingTransport(httpUrl);
    await pollTransport.connect(roomId, this.localPeerId, proofOfWork);

    this.attachTransport(pollTransport, roomId);
    this.activeTransportType = "polling";
    this.reconnectAttempts = 0;
  }

  private attachTransport(transport: SignalingTransport, roomId: string): void {
    if (this.transport !== null) {
      this.transport.close();
    }

    this.transport = transport;

    transport.onMessage((data: string) => {
      try {
        const parsed = JSON.parse(data) as SignalingMessage;
        this.handleSignalingMessage(parsed);
      } catch (err) {
        console.warn("[ZerithDB] Received malformed signaling message", err);
      }
    });

    transport.onClose(() => {
      if (!this.disposed && this.config.network?.autoReconnect !== false) {
        this.scheduleReconnect(roomId);
      }
    });

    transport.onError((err) => {
      console.error("[ZerithDB] Signaling transport error:", err);
    });
  }

  private wsUrlToHttp(wsUrl: string): string {
    if (wsUrl.startsWith("wss://")) {
      return "https://" + wsUrl.slice(6);
    }
    if (wsUrl.startsWith("ws://")) {
      return "http://" + wsUrl.slice(5);
    }
    return wsUrl;
  }

  // ─── Private — Signaling message handling ─────────────────────────────

  private async createProofOfWork(signalingUrl: string, roomId: string) {
    return fetchSignalingProofOfWork({
      baseUrl: this.wsUrlToHttp(signalingUrl),
      roomId,
      peerId: this.localPeerId,
    });
  }

  private async handleSignalingMessage(msg: SignalingMessage): Promise<void> {
    // ─── Identity enrichment (Phase 1) ───
    // Attach human-readable name if provided during signaling
    if (msg.from && msg.name) {
      const existing = this.peerInfo.get(msg.from);

      this.peerInfo.set(msg.from, {
        ...existing,
        peerId: msg.from,
        name: msg.name,
        ens: msg.ens,
      } as any);

      this.nameRegistry.register({
        name: msg.name,
        peerId: msg.from,
        ens: msg.ens,
        timestamp: Date.now(),
      });
    }

    switch (msg.type) {
      case "announcement":
        console.warn(`[ZerithDB] System Announcement: ${msg.payload}`);
        this.emit("announcement", msg.payload as string);
        break;

      case "peer-list":
        for (const peerId of msg.payload as PeerId[]) {
          if (peerId !== this.localPeerId) {
            this.createPeer(peerId, true);
          }
        }
        break;

      case "offer": {
        if (msg.to === this.localPeerId) {
          this.createPeer(msg.from, false, msg.payload);

          this.peerIdentity.set(msg.from, {
            name: msg.name,
            ens: msg.ens,
          });

          let resolvedPeerId = msg.from;

          if (msg.name?.endsWith(".eth")) {
            const resolved = await this.ensResolver.resolve(msg.name);
            if (resolved) {
              resolvedPeerId = resolved;
            }
          }

          const existing = this.peerInfo.get(msg.from);

          this.peerInfo.set(msg.from, {
            ...(existing ?? {
              peerId: msg.from,
              did: "",
              publicKey: "",
              connectedAt: Date.now(),
            }),
            name: msg.name ?? existing?.name,
            ens: msg.ens ?? existing?.ens,
          });
        }

        break;
      }

      case "answer":
        this.peers.get(msg.from)?.signal(msg.payload as any);
        break;

      case "ice-candidate":
        this.peers.get(msg.from)?.signal(msg.payload as any);
        break;
    }
  }

  private createPeer(remotePeerId: PeerId, initiator: boolean, offerPayload?: unknown): void {
    if (this.peers.has(remotePeerId)) return;

    const maxPeers = this.config.sync?.maxPeers ?? 10;
    if (this.peers.size >= maxPeers) return;

    const peer = new SimplePeer({
      initiator,
      trickle: true,
      streams: [...this.localStreams.values()],
      config: {
        iceServers: this.config.sync?.iceServers ?? [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });

    if (!initiator && offerPayload !== undefined) {
      peer.signal(offerPayload as any);
    }

    peer.on("signal", (data) => {
      // simple-peer fires 'signal' for offers, answers, AND trickle ICE candidates.
      // We must use data.type to send the correct signaling message type.
      const signalingType =
        data.type === "offer" ? "offer" : data.type === "answer" ? "answer" : "ice-candidate";
      this.transport?.send(
        JSON.stringify({
          type: signalingType,
          from: this.localPeerId,
          to: remotePeerId,
          payload: data,

          // Human-readable identity metadata
          name:
            this.config.network?.name?.trim() !== ""
              ? this.config.network?.name?.trim()
              : undefined,

          ens:
            this.config.network?.ens?.trim() !== "" ? this.config.network?.ens?.trim() : undefined,
        })
      );
    });

    peer.on("connect", () => {
      const identity = this.peerIdentity.get(remotePeerId);

      const info: PeerInfo = {
        peerId: remotePeerId,
        did: "",
        publicKey: "",
        connectedAt: Date.now(),
        name: identity?.name,
        ens: identity?.ens,
      };
      this.peerInfo.set(remotePeerId, info);
      this.emit("peer:connected", info);

      for (const [, metadata] of this.localStreamMetadata) {
        this.sendTo(remotePeerId, {
          type: "media-stream-metadata",
          payload: JSON.stringify(metadata),
        });
      }
    });

    peer.on("data", (data: Uint8Array | string) => {
      this.handleInboundDataAsync(remotePeerId, data);
    });

    peer.on("stream", (stream: MediaStream) => {
      this.rememberRemoteStream(remotePeerId, stream);
      this.emit("media:stream", {
        peerId: remotePeerId,
        stream,
        metadata: this.remoteStreamMetadata.get(remotePeerId)?.get(stream.id),
      });
    });

    peer.on("track", (track: MediaStreamTrack, stream: MediaStream) => {
      this.rememberRemoteStream(remotePeerId, stream);
      this.emit("media:track", { peerId: remotePeerId, track, stream });
    });

    peer.on("close", () => {
      this.peers.delete(remotePeerId);
      this.peerInfo.delete(remotePeerId);
      this.remoteStreams.delete(remotePeerId);
      this.remoteStreamMetadata.delete(remotePeerId);
      this.emit("peer:disconnected", { peerId: remotePeerId });
    });

    peer.on("error", (err: Error) => {
      this.emit("error", { peerId: remotePeerId, error: err });
      this.peers.delete(remotePeerId);
      this.peerInfo.delete(remotePeerId);
      this.remoteStreams.delete(remotePeerId);
      this.remoteStreamMetadata.delete(remotePeerId);
    });

    this.peers.set(remotePeerId, peer);
  }

  addMediaStream(
    stream: MediaStream,
    metadata: MediaStreamMetadataInput = {}
  ): MediaStreamMetadata {
    const normalized = this.buildMediaStreamMetadata(stream, metadata);

    this.localStreams.set(stream.id, stream);
    this.localStreamMetadata.set(stream.id, normalized);

    for (const [, peer] of this.peers) {
      peer.addStream(stream);
    }

    this.broadcastMediaStreamMetadata(normalized);
    return normalized;
  }

  /**
   * Stop publishing a local stream and notify peers that its metadata is gone.
   */
  removeMediaStream(streamOrId: MediaStream | string): void {
    const streamId = typeof streamOrId === "string" ? streamOrId : streamOrId.id;
    const stream = typeof streamOrId === "string" ? this.localStreams.get(streamId) : streamOrId;

    if (stream !== undefined) {
      for (const [, peer] of this.peers) {
        peer.removeStream(stream);
      }
    }

    this.localStreams.delete(streamId);
    this.localStreamMetadata.delete(streamId);
    this.broadcast({
      type: "media-stream-removed",
      payload: JSON.stringify({ streamId }),
    });
  }

  /**
   * Update metadata for an already published local stream.
   */
  updateMediaStreamMetadata(
    streamId: string,
    metadata: MediaStreamMetadataInput
  ): MediaStreamMetadata | undefined {
    const stream = this.localStreams.get(streamId);
    if (stream === undefined) return undefined;

    const previous = this.localStreamMetadata.get(streamId);
    const next = this.buildMediaStreamMetadata(stream, {
      ...previous,
      ...metadata,
    });

    this.localStreamMetadata.set(streamId, next);
    this.broadcastMediaStreamMetadata(next);
    return next;
  }

  /**
   * Enable or disable local audio/video tracks and publish fresh stream metadata.
   */
  setMediaTrackEnabled(kind: "audio" | "video", enabled: boolean, streamId?: string): void {
    const entries =
      streamId === undefined
        ? [...this.localStreams.entries()]
        : [...this.localStreams.entries()].filter(([id]) => id === streamId);

    for (const [id, stream] of entries) {
      const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
      for (const track of tracks) {
        track.enabled = enabled;
      }
      this.updateMediaStreamMetadata(id, {});
    }
  }

  /** Replace a track in every peer connection that receives a local stream. */
  replaceMediaTrack(
    streamId: string,
    oldTrack: MediaStreamTrack,
    newTrack: MediaStreamTrack
  ): void {
    const stream = this.localStreams.get(streamId);
    if (stream === undefined) return;

    for (const [, peer] of this.peers) {
      if (peer.connected) {
        peer.replaceTrack(oldTrack, newTrack, stream);
      }
    }
    this.updateMediaStreamMetadata(streamId, {});
  }

  /** Snapshot of local streams currently published to the mesh. */
  getLocalMediaStreams(): MediaStream[] {
    return [...this.localStreams.values()];
  }

  /** Snapshot of local stream metadata currently published to the mesh. */
  getLocalMediaStreamMetadata(streamId?: string): MediaStreamMetadata[] {
    if (streamId !== undefined) {
      const metadata = this.localStreamMetadata.get(streamId);
      return metadata === undefined ? [] : [metadata];
    }
    return [...this.localStreamMetadata.values()];
  }

  /** Snapshot of remote streams received from peers. */
  getRemoteMediaStreams(peerId?: PeerId): Array<{ peerId: PeerId; stream: MediaStream }> {
    const result: Array<{ peerId: PeerId; stream: MediaStream }> = [];
    for (const [remotePeerId, streams] of this.remoteStreams) {
      if (peerId !== undefined && remotePeerId !== peerId) continue;
      for (const [, stream] of streams) {
        result.push({ peerId: remotePeerId, stream });
      }
    }
    return result;
  }

  private handlePeerMessage(
    remotePeerId: PeerId,
    msg: { type: string; payload: string | Uint8Array }
  ): void {
    if (msg.type === "media-stream-metadata" && typeof msg.payload === "string") {
      const metadata = JSON.parse(msg.payload) as MediaStreamMetadata;
      let peerMetadata = this.remoteStreamMetadata.get(remotePeerId);
      if (peerMetadata === undefined) {
        peerMetadata = new Map();
        this.remoteStreamMetadata.set(remotePeerId, peerMetadata);
      }
      peerMetadata.set(metadata.streamId, metadata);
      this.emit("media:stream:metadata", { peerId: remotePeerId, metadata });
      return;
    }

    if (msg.type === "media-stream-removed" && typeof msg.payload === "string") {
      const payload = JSON.parse(msg.payload) as { streamId: string };
      this.remoteStreams.get(remotePeerId)?.delete(payload.streamId);
      this.remoteStreamMetadata.get(remotePeerId)?.delete(payload.streamId);
      this.emit("media:stream:removed", { peerId: remotePeerId, streamId: payload.streamId });
    }
  }

  private rememberRemoteStream(remotePeerId: PeerId, stream: MediaStream): void {
    let streams = this.remoteStreams.get(remotePeerId);
    if (streams === undefined) {
      streams = new Map();
      this.remoteStreams.set(remotePeerId, streams);
    }
    streams.set(stream.id, stream);
  }

  private broadcastMediaStreamMetadata(metadata: MediaStreamMetadata): void {
    this.broadcast({
      type: "media-stream-metadata",
      payload: JSON.stringify(metadata),
    });
  }

  private buildMediaStreamMetadata(
    stream: MediaStream,
    metadata: MediaStreamMetadataInput
  ): MediaStreamMetadata {
    const tracks = stream.getTracks().map((track) => ({
      trackId: track.id,
      kind: track.kind as "audio" | "video",
      label: track.label,
      enabled: track.enabled,
      muted: track.muted,
      readyState: track.readyState,
    }));

    const audioTracks = tracks.filter((track) => track.kind === "audio");
    const videoTracks = tracks.filter((track) => track.kind === "video");
    return {
      ...metadata,
      streamId: stream.id,
      peerId: this.localPeerId,
      kind: metadata.kind ?? "camera",
      audioMuted: audioTracks.length > 0 && audioTracks.every((track) => !track.enabled),
      videoMuted: videoTracks.length > 0 && videoTracks.every((track) => !track.enabled),
      tracks,
      updatedAt: Date.now(),
    };
  }

  private scheduleReconnect(roomId: string): void {
    const urls = this.getSignalingUrls();
    const delay = this.config.network?.reconnectDelay ?? 1000;
    const backoff = Math.min(delay * 2 ** this.reconnectAttempts, 30_000);
    const jitter = Math.random() * 1000;

    this.currentUrlIndex = (this.currentUrlIndex + 1) % urls.length;
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      void this.connect(roomId);
    }, backoff + jitter);
  }

  private async handleInboundDataAsync(
    remotePeerId: PeerId,
    data: Uint8Array | string
  ): Promise<void> {
    try {
      const msgStr = typeof data === "string" ? data : new TextDecoder().decode(data);
      const msg = JSON.parse(msgStr) as {
        type: string;
        payload: string | Uint8Array;
        signature?: string;
        senderPublicKey?: string;
      };

      if (this.auth?.biometric?.isBiometricRequiredForSync()) {
        if (!msg.signature || !msg.senderPublicKey) {
          console.warn(`[ZerithDB] Dropped unsigned WebRTC message from peer ${remotePeerId}`);
          return;
        }
        const payloadBytes =
          typeof msg.payload === "string"
            ? new TextEncoder().encode(msg.payload)
            : msg.payload instanceof Uint8Array
              ? msg.payload
              : new Uint8Array(msg.payload as any);

        const sigBytes = hexToBytes(msg.signature);
        const isValid = await this.auth.biometric.verify(
          payloadBytes,
          sigBytes,
          msg.senderPublicKey
        );
        if (!isValid) {
          console.error(
            `[ZerithDB] Invalid biometric signature on WebRTC message from peer ${remotePeerId}`
          );
          return;
        }
      }

      this.handlePeerMessage(remotePeerId, msg);
      this.emit("message", { ...msg, from: remotePeerId });
    } catch (err) {
      // Ignore malformed messages
    }
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (typeof hex !== "string" || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`hexToBytes() received an invalid hex string: "${hex}".`);
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
