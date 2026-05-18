import type { SignalingTransport } from "../signaling-transport.js";
import type { ProofOfWorkSolution } from "../pow.js";

/**
 * HTTP long-polling signaling transport.
 *
 * Used as a fallback when WebSockets are blocked by corporate firewalls.
 * Implements the same SignalingTransport interface as WebSocketTransport,
 * so the NetworkManager doesn't know which transport it's using.
 *
 * Protocol:
 *   POST /poll/join   → { sessionId, peerList }
 *   GET  /poll/messages?session=<id>&room=<room>  → long-poll (30s timeout)
 *   POST /poll/send   → relay a signaling message
 */
export class PollingTransport implements SignalingTransport {
  private _connected = false;
  private sessionId: string | null = null;
  private roomId: string | null = null;
  private polling = false;
  private abortController: AbortController | null = null;
  private messageHandler: ((data: string) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private errorHandler: ((err: unknown) => void) | null = null;

  /**
   * @param baseUrl - HTTP(S) base URL of the signaling server (no trailing slash)
   */
  constructor(private readonly baseUrl: string) {}

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Join a room via HTTP and start the long-polling loop.
   *
   * @param roomId - Room to join
   * @param peerId - Local peer identifier
   */
  async connect(
    roomId: string,
    peerId: string,
    proofOfWork?: ProofOfWorkSolution | null
  ): Promise<void> {
    this.roomId = roomId;

    const res = await fetch(`${this.baseUrl}/poll/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: roomId,
        peer: peerId,
        ...(proofOfWork ? { pow: proofOfWork } : {}),
      }),
    });

    if (!res.ok) {
      throw new Error(`Polling join failed: ${res.status} ${res.statusText}`);
    }

    const data = (await res.json()) as { sessionId: string; peerList: string[] };
    this.sessionId = data.sessionId;
    this._connected = true;

    // Emit the peer-list message in the same format as WebSocket
    const peerListMsg = JSON.stringify({
      type: "peer-list",
      from: "server",
      payload: data.peerList,
    });
    // Defer so the caller can attach handlers before the first message fires
    queueMicrotask(() => this.messageHandler?.(peerListMsg));

    // Start long-polling loop
    this.startPolling();
  }

  send(message: string): void {
    if (!this._connected || this.sessionId === null || this.roomId === null) return;

    // Fire-and-forget — errors are handled in the catch
    void fetch(`${this.baseUrl}/poll/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session: this.sessionId,
        room: this.roomId,
        message: JSON.parse(message),
      }),
    }).catch((err) => {
      this.errorHandler?.(err);
    });
  }

  close(): void {
    this._connected = false;
    this.polling = false;
    if (this.abortController !== null) {
      this.abortController.abort();
      this.abortController = null;
    }

    // Best-effort leave notification
    if (this.sessionId !== null && this.roomId !== null) {
      void fetch(`${this.baseUrl}/poll/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session: this.sessionId, room: this.roomId }),
      }).catch(() => {
        /* ignore — we're shutting down */
      });
    }

    this.sessionId = null;
    this.roomId = null;
  }

  onMessage(handler: (data: string) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  onError(handler: (err: unknown) => void): void {
    this.errorHandler = handler;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private startPolling(): void {
    this.polling = true;
    void this.pollLoop();
  }

  private async pollLoop(): Promise<void> {
    while (this.polling && this._connected) {
      try {
        this.abortController = new AbortController();

        const url =
          `${this.baseUrl}/poll/messages` +
          `?session=${encodeURIComponent(this.sessionId!)}` +
          `&room=${encodeURIComponent(this.roomId!)}`;

        const res = await fetch(url, {
          method: "GET",
          signal: this.abortController.signal,
        });

        if (!res.ok) {
          // Session expired or server error — treat as disconnect
          if (res.status === 404 || res.status === 410) {
            this._connected = false;
            this.polling = false;
            this.closeHandler?.();
            return;
          }
          // Transient error — wait before retrying
          await this.delay(2000);
          continue;
        }

        const data = (await res.json()) as { messages: string[] };

        for (const msg of data.messages) {
          this.messageHandler?.(msg);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // Expected when close() is called during a poll
          return;
        }

        // Network error — wait before retrying
        this.errorHandler?.(err);
        if (this.polling) {
          await this.delay(2000);
        }
      }
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
