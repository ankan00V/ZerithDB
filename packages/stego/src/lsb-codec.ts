/**
 * LSB (Least Significant Bit) pixel codec.
 *
 * Strategy: use the 2 lowest bits of each RGBA channel to store data.
 *   - 4 channels × 2 bits = 8 bits = 1 byte per pixel
 *   - Visually imperceptible on a noise canvas
 *   - 160×120 canvas → 19,200 bytes capacity per frame
 *
 * Encoding layout for byte `b` into pixel channels (R, G, B, A):
 *   R = (R & 0xFC) | (b >> 6) & 0x03   ← bits 7-6
 *   G = (G & 0xFC) | (b >> 4) & 0x03   ← bits 5-4
 *   B = (B & 0xFC) | (b >> 2) & 0x03   ← bits 3-2
 *   A = (A & 0xFC) | (b >> 0) & 0x03   ← bits 1-0
 */

/**
 * Encode `data` bytes into the LSBs of an RGBA pixel buffer.
 *
 * @param data     Bytes to hide. Must be ≤ pixels.length / 4.
 * @param pixels   RGBA flat array (length = width × height × 4).
 *                 Modified in-place and also returned.
 */
export function lsbEncode(data: Uint8Array, pixels: Uint8Array): Uint8Array {
  if (data.length > pixels.length / 4) {
    throw new RangeError(
      `Data length ${data.length} exceeds pixel capacity ${Math.floor(pixels.length / 4)}`
    );
  }

  for (let i = 0; i < data.length; i++) {
    const b  = data[i]!;
    const px = i * 4; // pixel base offset in RGBA array

    pixels[px + 0] = (pixels[px + 0]! & 0xfc) | ((b >> 6) & 0x03); // R ← bits 7-6
    pixels[px + 1] = (pixels[px + 1]! & 0xfc) | ((b >> 4) & 0x03); // G ← bits 5-4
    pixels[px + 2] = (pixels[px + 2]! & 0xfc) | ((b >> 2) & 0x03); // B ← bits 3-2
    pixels[px + 3] = (pixels[px + 3]! & 0xfc) | ((b >> 0) & 0x03); // A ← bits 1-0
  }

  return pixels;
}

/**
 * Decode bytes from the LSBs of an RGBA pixel buffer.
 *
 * @param pixels RGBA flat array.
 * @param length Number of bytes to extract. Must be ≤ pixels.length / 4.
 */
export function lsbDecode(pixels: Uint8Array, length: number): Uint8Array {
  if (length > pixels.length / 4) {
    throw new RangeError(
      `Requested length ${length} exceeds pixel capacity ${Math.floor(pixels.length / 4)}`
    );
  }

  const out = new Uint8Array(length);

  for (let i = 0; i < length; i++) {
    const px = i * 4;
    out[i] =
      ((pixels[px + 0]! & 0x03) << 6) | // R → bits 7-6
      ((pixels[px + 1]! & 0x03) << 4) | // G → bits 5-4
      ((pixels[px + 2]! & 0x03) << 2) | // B → bits 3-2
      ((pixels[px + 3]! & 0x03) << 0);  // A → bits 1-0
  }

  return out;
}