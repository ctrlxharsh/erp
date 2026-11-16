import { MAX_IMAGE_EDGE } from "@erp/domain";
import sharp from "sharp";

/**
 * Converts any accepted image to WebP, fits it inside MAX_IMAGE_EDGE and strips metadata
 * (EXIF, GPS, ICC comments). sharp drops metadata unless asked to keep it; `rotate()` applies the
 * EXIF orientation first so the picture still faces the right way.
 */
export async function toWebp(input: Uint8Array): Promise<Uint8Array> {
  const output = await sharp(input, { failOn: "error", limitInputPixels: 50_000_000 })
    .rotate()
    .resize({
      width: MAX_IMAGE_EDGE,
      height: MAX_IMAGE_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: 82 })
    .toBuffer();
  return new Uint8Array(output);
}
