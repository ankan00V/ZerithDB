// ─────────────────────────────────────────────────────────────────────────────
// Steganographic Transport — Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

/** Magic bytes that mark a ZerithDB stego frame: ASCII "ZRDB" */
export const STEGO_MAGIC = new Uint8Array([0x5a, 0x52, 0x44, 0x42]);

/**
 * Canvas dimensions for the dummy video track.
 * 160×120 at 2 LSBs/channel = 19,200 bytes capacity per frame.
 * Small enough to be low-overhead; large enough for typical CRDT deltas.
 */
export const CANVAS_WIDTH  = 160;
export const CANVAS_HEIGHT = 120;

/** Bytes per pixel when using 2 LSBs from each of 4 RGBA channels. */
export const BYTES_PER_PIXEL = 1;

/** Total payload capacity of one video frame in bytes. */
export const FRAME_CAPACITY = CANVAS_WIDTH * CANVAS_HEIGHT * BYTES_PER_PIXEL;

/** Size of the frame header in bytes. */
export const HEADER_SIZE = 16;

/** Maximum CRDT payload bytes per chunk (frame capacity minus header). */
export const MAX_CHUNK_SIZE = FRAME_CAPACITY - HEADER_SIZE;

/**
 * Decoded frame header extracted from a raw pixel buffer.
 */
export interface FrameHeader {
  /** Monotonically increasing sequence number for this send operation. */
  sequence:    number;
  /** Zero-based index of this chunk within the sequence. */
  chunkIndex:  number;
  /** Total number of chunks in this sequence. */
  totalChunks: number;
  /** Byte length of the payload in this frame. */
  payloadLength: number;
  /** XOR checksum over the payload bytes. */
  checksum:    number;
  /** Collection name length prefix (bytes). */
  collectionNameLength: number;
}

/**
 * A fully decoded chunk ready for reassembly.
 */
export interface DecodedChunk {
  header:  FrameHeader;
  payload: Uint8Array;
}

/** Callback fired when a complete payload is reassembled from chunks. */
export type OnPayloadReady = (collectionName: string, payload: Uint8Array) => void;