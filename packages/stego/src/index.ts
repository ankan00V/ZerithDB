export { lsbEncode, lsbDecode } from "./lsb-codec.js";
export { encodeFrame, decodeFrame, chunkPayload } from "./frame-codec.js";
export { ReassemblyBuffer } from "./reassembly-buffer.js";
export { StegoChannel } from "./stego-channel.js";
export type { StegoChannelOptions } from "./stego-channel.js";
export type { FrameEncodeInput, FrameDecodeResult } from "./frame-codec.js";
export type { OnPayloadReady } from "./types.js";
export {
  STEGO_MAGIC,
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  FRAME_CAPACITY,
  HEADER_SIZE,
  MAX_CHUNK_SIZE,
} from "./types.js";