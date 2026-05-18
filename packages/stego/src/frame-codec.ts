import { STEGO_MAGIC, HEADER_SIZE, MAX_CHUNK_SIZE } from "./types.js";

/**
 * Frame codec — serialises/deserialises the binary protocol written into
 * pixel LSBs. Every video frame carries exactly one chunk.
 *
 * Header layout (16 bytes):
 * ┌─────────┬────────────┬────────────┬─────────────┬──────────────────┬──────────┬──────────┐
 * │ 4 bytes │  2 bytes   │  2 bytes   │   2 bytes   │     4 bytes      │  1 byte  │  1 byte  │
 * │  MAGIC  │  sequence  │ chunkIndex │ totalChunks │  payloadLength   │ checksum │ colLen   │
 * └─────────┴────────────┴────────────┴─────────────┴──────────────────┴──────────┴──────────┘
 *
 * Followed immediately by:
 *   [colLen bytes: UTF-8 collection name]
 *   [payloadLength bytes: CRDT delta chunk]
 */

export interface FrameEncodeInput {
  sequence:       number;
  chunkIndex:     number;
  totalChunks:    number;
  collectionName: string;
  chunk:          Uint8Array;
}

export interface FrameDecodeResult {
  sequence:       number;
  chunkIndex:     number;
  totalChunks:    number;
  collectionName: string;
  payload:        Uint8Array;
}

/**
 * Encode one chunk into a flat byte array (header + collection name + payload).
 * This is what gets written into the pixel LSBs.
 */
export function encodeFrame(input: FrameEncodeInput): Uint8Array {
  const nameBytes = new TextEncoder().encode(input.collectionName);
  if (nameBytes.length > 255) throw new RangeError("Collection name too long (max 255 bytes)");

  const checksum = xorChecksum(input.chunk);
  const total    = HEADER_SIZE + nameBytes.length + input.chunk.length;
  const frame    = new Uint8Array(total);
  const view     = new DataView(frame.buffer);

  // Magic
  frame.set(STEGO_MAGIC, 0);
  // sequence (uint16 big-endian)
  view.setUint16(4, input.sequence  & 0xffff, false);
  // chunkIndex (uint16)
  view.setUint16(6, input.chunkIndex & 0xffff, false);
  // totalChunks (uint16)
  view.setUint16(8, input.totalChunks & 0xffff, false);
  // payloadLength (uint32)
  view.setUint32(10, input.chunk.length, false);
  // checksum (uint8)
  frame[14] = checksum;
  // collection name length (uint8)
  frame[15] = nameBytes.length;

  // Collection name + payload
  frame.set(nameBytes, HEADER_SIZE);
  frame.set(input.chunk, HEADER_SIZE + nameBytes.length);

  return frame;
}

/**
 * Decode a raw byte array (extracted from pixel LSBs) back into a frame.
 * Returns null if magic bytes are absent or the checksum fails.
 */
export function decodeFrame(raw: Uint8Array): FrameDecodeResult | null {
  if (raw.length < HEADER_SIZE) return null;

  // Magic check
  for (let i = 0; i < 4; i++) {
    if (raw[i] !== STEGO_MAGIC[i]) return null;
  }

  const view          = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const sequence      = view.getUint16(4, false);
  const chunkIndex    = view.getUint16(6, false);
  const totalChunks   = view.getUint16(8, false);
  const payloadLength = view.getUint32(10, false);
  const checksum      = raw[14]!;
  const colLen        = raw[15]!;

  const nameStart    = HEADER_SIZE;
  const payloadStart = nameStart + colLen;
  const payloadEnd   = payloadStart + payloadLength;

  if (raw.length < payloadEnd) return null;

  const collectionName = new TextDecoder().decode(raw.slice(nameStart, payloadStart));
  const payload        = raw.slice(payloadStart, payloadEnd);

  if (xorChecksum(payload) !== checksum) return null;

  return { sequence, chunkIndex, totalChunks, collectionName, payload };
}

/**
 * Split a payload into chunks sized for one video frame each.
 */
export function chunkPayload(
  collectionName: string,
  payload:        Uint8Array
): FrameEncodeInput[] {
  const nameBytes  = new TextEncoder().encode(collectionName);
  const chunkSize  = MAX_CHUNK_SIZE - nameBytes.length;
  const totalChunks = Math.max(1, Math.ceil(payload.length / chunkSize));
  const sequence   = (Math.random() * 0xffff) >>> 0;
  const frames: FrameEncodeInput[] = [];

  for (let i = 0; i < totalChunks; i++) {
    frames.push({
      sequence,
      chunkIndex:  i,
      totalChunks,
      collectionName,
      chunk: payload.slice(i * chunkSize, (i + 1) * chunkSize),
    });
  }

  return frames;
}

// ─── Internal ────────────────────────────────────────────────────────────────

function xorChecksum(data: Uint8Array): number {
  let acc = 0;
  for (const b of data) acc ^= b;
  return acc;
}