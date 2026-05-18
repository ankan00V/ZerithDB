import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { lsbEncode, lsbDecode } from "../lsb-codec.js";
import { encodeFrame, decodeFrame, chunkPayload } from "../frame-codec.js";
import { ReassemblyBuffer } from "../reassembly-buffer.js";
import { HEADER_SIZE, MAX_CHUNK_SIZE, CANVAS_WIDTH, CANVAS_HEIGHT } from "../types.js";

// ─── LSB Codec ────────────────────────────────────────────────────────────────

describe("lsbEncode / lsbDecode", () => {
  it("round-trips a simple byte array", () => {
    const data   = new Uint8Array([0x00, 0xff, 0xab, 0x42, 0x01]);
    const pixels = new Uint8Array(data.length * 4).fill(200); // mid-grey
    lsbEncode(data, pixels);
    const decoded = lsbDecode(pixels, data.length);
    expect(decoded).toEqual(data);
  });

  it("round-trips all 256 possible byte values", () => {
    const data   = new Uint8Array(256);
    for (let i = 0; i < 256; i++) data[i] = i;
    const pixels = new Uint8Array(256 * 4).fill(128);
    lsbEncode(data, pixels);
    expect(lsbDecode(pixels, 256)).toEqual(data);
  });

  it("does not modify bits above the 2 LSBs of each channel", () => {
    const pixels = new Uint8Array(4).fill(0xff); // all bits set
    lsbEncode(new Uint8Array([0x00]), pixels);
    // Upper 6 bits of each channel must still be 1 (0xFC = 11111100)
    expect(pixels[0]! & 0xfc).toBe(0xfc);
    expect(pixels[1]! & 0xfc).toBe(0xfc);
    expect(pixels[2]! & 0xfc).toBe(0xfc);
    expect(pixels[3]! & 0xfc).toBe(0xfc);
  });

  it("throws when data exceeds pixel capacity", () => {
    const pixels = new Uint8Array(4); // 1 pixel = 1 byte capacity
    expect(() => lsbEncode(new Uint8Array(2), pixels)).toThrow(RangeError);
  });

  it("throws when decode length exceeds pixel capacity", () => {
    const pixels = new Uint8Array(4); // 1 pixel = 1 byte capacity
    expect(() => lsbDecode(pixels, 2)).toThrow(RangeError);
  });

  it("is imperceptible — max channel deviation is 3", () => {
    const original = new Uint8Array(100 * 4).fill(200);
    const pixels   = new Uint8Array(original);
    const data     = new Uint8Array(100).fill(0xaa);
    lsbEncode(data, pixels);
    for (let i = 0; i < pixels.length; i++) {
      expect(Math.abs(pixels[i]! - original[i]!)).toBeLessThanOrEqual(3);
    }
  });
});

// ─── Frame Codec ──────────────────────────────────────────────────────────────

describe("encodeFrame / decodeFrame", () => {
  it("round-trips a simple frame", () => {
    const payload = new Uint8Array([10, 20, 30, 40]);
    const frame   = encodeFrame({
      sequence:       42,
      chunkIndex:     0,
      totalChunks:    1,
      collectionName: "todos",
      chunk:          payload,
    });
    const decoded = decodeFrame(frame);

    expect(decoded).not.toBeNull();
    expect(decoded!.sequence).toBe(42);
    expect(decoded!.chunkIndex).toBe(0);
    expect(decoded!.totalChunks).toBe(1);
    expect(decoded!.collectionName).toBe("todos");
    expect(decoded!.payload).toEqual(payload);
  });

  it("returns null on wrong magic bytes", () => {
    const frame    = encodeFrame({
      sequence: 1, chunkIndex: 0, totalChunks: 1,
      collectionName: "test", chunk: new Uint8Array([1]),
    });
    frame[0] = 0x00; // corrupt magic
    expect(decodeFrame(frame)).toBeNull();
  });

  it("returns null on checksum mismatch", () => {
    const frame = encodeFrame({
      sequence: 1, chunkIndex: 0, totalChunks: 1,
      collectionName: "test", chunk: new Uint8Array([1, 2, 3]),
    });
    frame[frame.length - 1] ^= 0xff; // corrupt last payload byte
    expect(decodeFrame(frame)).toBeNull();
  });

  it("returns null when buffer is too short", () => {
    expect(decodeFrame(new Uint8Array(HEADER_SIZE - 1))).toBeNull();
  });

  it("handles unicode collection names", () => {
    const name  = "todos-🔒";
    const chunk = new Uint8Array([99]);
    const frame = encodeFrame({ sequence: 0, chunkIndex: 0, totalChunks: 1, collectionName: name, chunk });
    expect(decodeFrame(frame)?.collectionName).toBe(name);
  });

  it("handles empty payload", () => {
    const frame   = encodeFrame({
      sequence: 7, chunkIndex: 0, totalChunks: 1,
      collectionName: "empty", chunk: new Uint8Array(0),
    });
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload.length).toBe(0);
  });
});

// ─── chunkPayload ─────────────────────────────────────────────────────────────

describe("chunkPayload", () => {
  it("produces a single chunk for small payloads", () => {
    const chunks = chunkPayload("col", new Uint8Array(100));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.totalChunks).toBe(1);
    expect(chunks[0]!.chunkIndex).toBe(0);
  });

  it("splits large payloads into multiple chunks", () => {
    const bigPayload = new Uint8Array(MAX_CHUNK_SIZE * 3 + 50);
    const chunks     = chunkPayload("col", bigPayload);
    expect(chunks.length).toBe(4);
    expect(chunks.every((c) => c.totalChunks === 4)).toBe(true);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });

  it("all chunks share the same sequence number", () => {
    const chunks = chunkPayload("col", new Uint8Array(MAX_CHUNK_SIZE * 2));
    const seqs   = new Set(chunks.map((c) => c.sequence));
    expect(seqs.size).toBe(1);
  });

  it("reassembled chunks equal original payload", () => {
    const original = new Uint8Array(MAX_CHUNK_SIZE + 500);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;

    const chunks     = chunkPayload("col", original);
    const reassembled = new Uint8Array(original.length);
    let offset = 0;
    for (const c of chunks) {
      reassembled.set(c.chunk, offset);
      offset += c.chunk.length;
    }
    expect(reassembled).toEqual(original);
  });
});

// ─── ReassemblyBuffer ─────────────────────────────────────────────────────────

describe("ReassemblyBuffer", () => {
  it("calls onPayloadReady immediately for single-chunk sequences", () => {
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 1000);
    buf.ingest(1, 0, 1, "todos", new Uint8Array([10, 20, 30]));
    expect(cb).toHaveBeenCalledOnce();
    expect(cb).toHaveBeenCalledWith("todos", new Uint8Array([10, 20, 30]));
    buf.dispose();
  });

  it("reassembles two chunks in order", () => {
    const cb      = vi.fn();
    const buf     = new ReassemblyBuffer(cb, 1000);
    const chunk0  = new Uint8Array([1, 2]);
    const chunk1  = new Uint8Array([3, 4]);

    buf.ingest(99, 0, 2, "col", chunk0);
    expect(cb).not.toHaveBeenCalled(); // not complete yet

    buf.ingest(99, 1, 2, "col", chunk1);
    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]![1]).toEqual(new Uint8Array([1, 2, 3, 4]));
    buf.dispose();
  });

  it("reassembles chunks arriving out of order", () => {
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 1000);

    buf.ingest(5, 2, 3, "col", new Uint8Array([5, 6])); // last chunk first
    buf.ingest(5, 0, 3, "col", new Uint8Array([1, 2])); // first chunk last
    buf.ingest(5, 1, 3, "col", new Uint8Array([3, 4])); // middle chunk

    expect(cb).toHaveBeenCalledOnce();
    expect(cb.mock.calls[0]![1]).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    buf.dispose();
  });

  it("ignores duplicate chunks", () => {
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 1000);

    buf.ingest(10, 0, 2, "col", new Uint8Array([1]));
    buf.ingest(10, 0, 2, "col", new Uint8Array([1])); // duplicate
    buf.ingest(10, 1, 2, "col", new Uint8Array([2]));

    expect(cb).toHaveBeenCalledOnce();
    buf.dispose();
  });

  it("handles independent sequences simultaneously", () => {
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 1000);

    buf.ingest(1, 0, 1, "a", new Uint8Array([1]));
    buf.ingest(2, 0, 1, "b", new Uint8Array([2]));

    expect(cb).toHaveBeenCalledTimes(2);
    buf.dispose();
  });

  it("evicts stale incomplete sequences", () => {
    vi.useFakeTimers();
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 500); // 500 ms timeout

    buf.ingest(77, 0, 2, "col", new Uint8Array([1])); // only chunk 0 — chunk 1 lost

    vi.advanceTimersByTime(1000); // past timeout
    buf.evictStale();

    expect(buf.pendingCount).toBe(0); // evicted
    expect(cb).not.toHaveBeenCalled(); // never completed
    buf.dispose();
    vi.useRealTimers();
  });

  it("does not call onPayloadReady for evicted sequences even if late chunk arrives", () => {
    vi.useFakeTimers();
    const cb  = vi.fn();
    const buf = new ReassemblyBuffer(cb, 500);

    buf.ingest(88, 0, 2, "col", new Uint8Array([1]));
    vi.advanceTimersByTime(1000);
    buf.evictStale();

    // Late-arriving chunk 1 after eviction — starts a fresh (incomplete) entry
    buf.ingest(88, 1, 2, "col", new Uint8Array([2]));
    expect(cb).not.toHaveBeenCalled();

    buf.dispose();
    vi.useRealTimers();
  });
});

// ─── Full pipeline: encode → pixels → decode ─────────────────────────────────

describe("Full LSB + Frame pipeline", () => {
  it("round-trips a CRDT payload through pixels", () => {
    const original = new Uint8Array(200);
    for (let i = 0; i < 200; i++) original[i] = (i * 37) % 256;

    const frames = chunkPayload("my-collection", original);
    expect(frames).toHaveLength(1);

    const frameBytes = encodeFrame(frames[0]!);

    // Simulate canvas pixel buffer
    const pixelCount = CANVAS_WIDTH * CANVAS_HEIGHT;
    const pixels     = new Uint8Array(pixelCount * 4).fill(128);

    lsbEncode(frameBytes, pixels);

    const decoded     = lsbDecode(pixels, frameBytes.length);
    const frameResult = decodeFrame(decoded);

    expect(frameResult).not.toBeNull();
    expect(frameResult!.collectionName).toBe("my-collection");
    expect(frameResult!.payload).toEqual(original);
  });

  it("round-trips through full reassembly for a large payload", () => {
    const original = new Uint8Array(MAX_CHUNK_SIZE * 2 + 100);
    for (let i = 0; i < original.length; i++) original[i] = i % 256;

    const received: Uint8Array[] = [];
    const buf = new ReassemblyBuffer((_, payload) => received.push(payload), 5000);

    const frames = chunkPayload("large-col", original);
    const pixelCount = CANVAS_WIDTH * CANVAS_HEIGHT;

    for (const frameInput of frames) {
      const frameBytes = encodeFrame(frameInput);
      const pixels     = new Uint8Array(pixelCount * 4).fill(128);
      lsbEncode(frameBytes, pixels);

      const decoded = lsbDecode(pixels, frameBytes.length);
      const result  = decodeFrame(decoded);
      expect(result).not.toBeNull();

      buf.ingest(
        result!.sequence,
        result!.chunkIndex,
        result!.totalChunks,
        result!.collectionName,
        result!.payload
      );
    }

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(original);
    buf.dispose();
  });
});