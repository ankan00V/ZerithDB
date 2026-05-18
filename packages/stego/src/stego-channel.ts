import { lsbEncode, lsbDecode } from "./lsb-codec.js";
import { encodeFrame, decodeFrame, chunkPayload } from "./frame-codec.js";
import { ReassemblyBuffer } from "./reassembly-buffer.js";
import {
  CANVAS_WIDTH, CANVAS_HEIGHT, FRAME_CAPACITY, HEADER_SIZE,
} from "./types.js";

/** Matches the SyncPlugin interface from zerithdb-network without adding a dependency. */
interface SyncPlugin {
  id:       string;
  version:  number;
  onBeforeApplyUpdate?: (
    collectionName: string,
    update:         Uint8Array,
    fromPeer:       string
  ) => Uint8Array | null | Promise<Uint8Array | null>;
  onBeforeSendUpdate?: (
    collectionName: string,
    update:         Uint8Array
  ) => Uint8Array | null | Promise<Uint8Array | null>;
}

export interface StegoChannelOptions {
  /**
   * Frame rate for the steganographic video track.
   * Higher FPS = higher throughput but more CPU.
   * @default 10
   */
  fps?: number;
  /**
   * Timeout in ms before incomplete sequences (due to packet loss) are discarded.
   * @default 5000
   */
  reassemblyTimeoutMs?: number;
  /**
   * Called when a full CRDT payload is decoded from incoming video frames.
   * Wire this to your SyncEngine / Y.applyUpdate() call.
   */
  onPayloadDecoded: (collectionName: string, payload: Uint8Array) => void;
}

/**
 * StegoChannel — steganographic CRDT transport over WebRTC video.
 *
 * Implements `SyncPlugin` so it can be registered with the SyncEngine:
 *
 * ```ts
 * const stego = new StegoChannel({
 *   onPayloadDecoded: (col, update) => syncEngine.applyRemoteUpdate(col, update),
 * });
 * syncEngine.registerPlugin(stego);
 *
 * // Add the canvas track to your NetworkManager:
 * const stream = stego.createStream();
 * networkManager.addMediaStream(stream, { kind: "custom", label: "stego" });
 *
 * // Feed incoming video tracks to the decoder:
 * networkManager.on("media:track", ({ track }) => stego.attachIncomingTrack(track));
 * ```
 *
 * ## How it works
 *
 * ### Sending
 * 1. `onBeforeSendUpdate` intercepts each CRDT delta.
 * 2. The delta is split into chunks (≤ 19,184 bytes each).
 * 3. Each chunk is serialised with a binary frame header.
 * 4. The header+chunk bytes are written into the 2 LSBs of RGBA pixel channels
 *    on a hidden canvas (160×120 = 19,200 bytes capacity / frame).
 * 5. The canvas produces a `MediaStreamTrack` that looks like noise video.
 * 6. Returns `null` so the SyncEngine suppresses the RTCDataChannel send.
 *
 * ### Receiving
 * 1. Incoming video tracks are captured frame-by-frame via `ImageCapture.grabFrame()`.
 * 2. Each frame's pixel data is decoded from LSBs → raw bytes.
 * 3. The frame header is parsed and the payload chunk is fed to `ReassemblyBuffer`.
 * 4. When all chunks for a sequence arrive, `onPayloadDecoded` is called.
 *
 * ### Packet-loss resilience
 * - Incomplete sequences are evicted after `reassemblyTimeoutMs` (default 5 s).
 * - Each frame is self-contained — no inter-frame dependencies.
 * - Critical updates should still be sent via RTCDataChannel as a fallback
 *   (remove the `return null` in `onBeforeSendUpdate` if dual-path is desired).
 */
export class StegoChannel implements SyncPlugin {
  readonly id      = "zerithdb-stego";
  readonly version = 1;

  private canvas:  HTMLCanvasElement | null = null;
  private ctx:     CanvasRenderingContext2D | null = null;
  private stream:  MediaStream | null = null;
  private readonly fps: number;
  private readonly buffer: ReassemblyBuffer;

  constructor(private readonly options: StegoChannelOptions) {
    this.fps    = options.fps ?? 10;
    this.buffer = new ReassemblyBuffer(
      options.onPayloadDecoded,
      options.reassemblyTimeoutMs ?? 5_000
    );
  }

  // ─── SyncPlugin ───────────────────────────────────────────────────────────

  /**
   * Intercepts outgoing CRDT updates.
   * Encodes them into the canvas pixel LSBs and returns `null` to suppress
   * the RTCDataChannel send (steganographic bypass mode).
   */
  async onBeforeSendUpdate(
    collectionName: string,
    update:         Uint8Array
  ): Promise<Uint8Array | null> {
    if (this.ctx === null) return update; // Canvas not ready — fall back to data channel

    const frames = chunkPayload(collectionName, update);

    for (const frameInput of frames) {
      const frameBytes = encodeFrame(frameInput);
      this.writeFrameToCanvas(frameBytes);

      // Yield to let the canvas stream capture the frame
      await new Promise<void>((resolve) => setTimeout(resolve, 1000 / this.fps));
    }

    return null; // Suppress RTCDataChannel transmission
  }

  // ─── Canvas / Stream API ──────────────────────────────────────────────────

  /**
   * Creates and returns the steganographic `MediaStream`.
   * Add this stream to your `NetworkManager` to start broadcasting.
   *
   * Must be called in a browser environment with canvas + captureStream support.
   */
  createStream(): MediaStream {
    const canvas = document.createElement("canvas");
    canvas.width  = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (ctx === null) throw new Error("[Stego] Failed to get canvas 2D context");

    // Fill with random noise as baseline (looks like a blank noisy feed)
    this.fillNoise(ctx);

    this.canvas = canvas;
    this.ctx    = ctx;
    this.stream = (canvas as any).captureStream(this.fps) as MediaStream;
    return this.stream;
  }

  /**
   * Attach an incoming `MediaStreamTrack` (video) from a remote peer.
   * Starts extracting and decoding steganographic data from each frame.
   *
   * Requires `ImageCapture` API (available in Chrome/Edge; polyfill for Firefox).
   */
  attachIncomingTrack(track: MediaStreamTrack): void {
    if (track.kind !== "video") return;

    // ImageCapture browser API for frame extraction
    interface ImageCaptureAPI {
      grabFrame(): Promise<ImageBitmap>;
    }
    const ImageCaptureConstructor = (globalThis as any).ImageCapture as {
      new (track: MediaStreamTrack): ImageCaptureAPI;
    };
    const capture = new ImageCaptureConstructor(track);
    let running   = true;

    const poll = async (): Promise<void> => {
      while (running && track.readyState === "live") {
        try {
          const bitmap = await capture.grabFrame();
          this.decodeImageBitmap(bitmap);
        } catch {
          // Frame grab failed (e.g. track ended) — stop polling
          running = false;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 1000 / this.fps));
      }
    };

    track.addEventListener("ended", () => { running = false; });
    void poll();
  }

  /** Stop all activity and clean up resources. */
  dispose(): void {
    this.buffer.dispose();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.canvas = null;
    this.ctx    = null;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private writeFrameToCanvas(frameBytes: Uint8Array): void {
    if (this.ctx === null || this.canvas === null) return;

    // Get current pixel data
    const imageData = this.ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels    = imageData.data as unknown as Uint8Array;

    // Encode frame into LSBs
    lsbEncode(frameBytes, pixels);

    this.ctx.putImageData(imageData, 0, 0);
  }

  private decodeImageBitmap(bitmap: ImageBitmap): void {
    // Draw to an offscreen canvas to access pixel data
    const offscreen = document.createElement("canvas");
    offscreen.width  = bitmap.width;
    offscreen.height = bitmap.height;

    const ctx = offscreen.getContext("2d");
    if (ctx === null) return;

    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();

    const imageData   = ctx.getImageData(0, 0, offscreen.width, offscreen.height);
    const pixels      = imageData.data as unknown as Uint8Array;

    // Read the header bytes first (HEADER_SIZE pixels)
    const headerBytes = lsbDecode(pixels, HEADER_SIZE);
    const result      = decodeFrame(
      // Full decode: read enough bytes for header + worst-case payload
      lsbDecode(pixels, Math.min(FRAME_CAPACITY, pixels.length / 4))
    );

    if (result === null) return; // Not a stego frame or corrupted

    this.buffer.ingest(
      result.sequence,
      result.chunkIndex,
      result.totalChunks,
      result.collectionName,
      result.payload
    );
  }

  private fillNoise(ctx: CanvasRenderingContext2D): void {
    const imageData = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const pixels    = imageData.data;
    // Fill with mid-grey noise so LSB changes are imperceptible
    for (let i = 0; i < pixels.length; i++) {
      pixels[i] = 128 + (Math.random() * 64 - 32) | 0;
    }
    ctx.putImageData(imageData, 0, 0);
  }
}