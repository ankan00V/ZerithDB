import type { OnPayloadReady } from "./types.js";

interface PendingSequence {
  totalChunks:    number;
  collectionName: string;
  chunks:         Map<number, Uint8Array>;
  receivedAt:     number;
}

/**
 * Reassembles chunked CRDT payloads from individual video frame extracts.
 *
 * Packet-loss handling strategy:
 *  - Each sequence is kept in a pending map.
 *  - A sequence is considered complete only when ALL chunks arrive.
 *  - Incomplete sequences are evicted after `timeoutMs` to prevent memory leaks.
 *  - Duplicate chunks are silently dropped (idempotent).
 */
export class ReassemblyBuffer {
  private readonly pending = new Map<number, PendingSequence>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly onPayloadReady: OnPayloadReady,
    private readonly timeoutMs: number = 5_000
  ) {
    // Run cleanup every 2 seconds
    this.cleanupTimer = setInterval(() => this.evictStale(), 2_000);
  }

  /**
   * Feed a decoded chunk into the buffer.
   * If this chunk completes a sequence, `onPayloadReady` is called immediately.
   */
  ingest(
    sequence:       number,
    chunkIndex:     number,
    totalChunks:    number,
    collectionName: string,
    chunk:          Uint8Array
  ): void {
    if (totalChunks === 0) return;

    // Single-chunk fast path
    if (totalChunks === 1 && chunkIndex === 0) {
      this.onPayloadReady(collectionName, chunk);
      return;
    }

    let pending = this.pending.get(sequence);
    if (pending === undefined) {
      pending = {
        totalChunks,
        collectionName,
        chunks: new Map(),
        receivedAt: Date.now(),
      };
      this.pending.set(sequence, pending);
    }

    // Duplicate chunk — skip
    if (pending.chunks.has(chunkIndex)) return;

    pending.chunks.set(chunkIndex, chunk);

    // Check if complete
    if (pending.chunks.size === pending.totalChunks) {
      const reassembled = this.reassemble(pending);
      this.pending.delete(sequence);
      this.onPayloadReady(collectionName, reassembled);
    }
  }

  /** Remove stale incomplete sequences (packet loss caused missing chunks). */
  evictStale(): void {
    const cutoff = Date.now() - this.timeoutMs;
    for (const [seq, pending] of this.pending) {
      if (pending.receivedAt < cutoff) {
        this.pending.delete(seq);
      }
    }
  }

  /** Number of sequences currently awaiting more chunks. */
  get pendingCount(): number {
    return this.pending.size;
  }

  /** Stop background cleanup (call on teardown). */
  dispose(): void {
    if (this.cleanupTimer !== null) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.pending.clear();
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private reassemble(pending: PendingSequence): Uint8Array {
    const totalBytes = [...pending.chunks.values()].reduce((sum, c) => sum + c.length, 0);
    const out        = new Uint8Array(totalBytes);
    let offset       = 0;

    for (let i = 0; i < pending.totalChunks; i++) {
      const chunk = pending.chunks.get(i)!;
      out.set(chunk, offset);
      offset += chunk.length;
    }

    return out;
  }
}