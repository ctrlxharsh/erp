import { detectFileType, MAX_IMAGE_EDGE } from "@erp/domain";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { toWebp } from "./images";

async function jpeg(width: number, height: number, withExif: boolean) {
  let image = sharp({ create: { width, height, channels: 3, background: "#01306f" } }).jpeg();
  if (withExif) image = image.withExif({ IFD0: { Copyright: "private-owner", Make: "TestCam" } });
  return new Uint8Array(await image.toBuffer());
}

describe("toWebp", () => {
  it("outputs WebP", async () => {
    expect(detectFileType(await toWebp(await jpeg(100, 80, false)))).toBe("webp");
  });

  it("strips EXIF metadata", async () => {
    const input = await jpeg(100, 80, true);
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const output = await toWebp(input);
    expect((await sharp(output).metadata()).exif).toBeUndefined();
    expect(Buffer.from(output).includes("private-owner")).toBe(false);
  });

  it(`shrinks large images to ${MAX_IMAGE_EDGE}px on the long edge and never enlarges`, async () => {
    const big = await sharp(await toWebp(await jpeg(4000, 1000, false))).metadata();
    expect(big.width).toBe(MAX_IMAGE_EDGE);
    expect(big.height).toBe(512);
    const small = await sharp(await toWebp(await jpeg(300, 200, false))).metadata();
    expect([small.width, small.height]).toEqual([300, 200]);
  });

  it("rejects files that are not valid images", async () => {
    await expect(toWebp(new TextEncoder().encode("not an image"))).rejects.toThrow();
  });
});
