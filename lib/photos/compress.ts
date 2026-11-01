"use client";

/**
 * Browser-native photo compression (no dependency):
 * decode (EXIF orientation applied) -> resize to <= 1280 px -> encode WebP,
 * falling back to JPEG where the browser can't encode WebP -> step down until
 * the result fits the 1 MiB bucket limit.
 */
import {
  COMPRESSION_ATTEMPTS,
  checkPhotoInput,
  extensionForType,
  fitWithin,
  fitsLimit,
  PHOTO_PROBLEM_MESSAGES,
  type PhotoInputProblem,
} from "./compress-plan.ts";
import type { PhotoExtension } from "./constants.ts";

export type PhotoProblem = keyof typeof PHOTO_PROBLEM_MESSAGES;

export class PhotoPrepareError extends Error {
  readonly problem: PhotoProblem;
  constructor(problem: PhotoProblem) {
    super(PHOTO_PROBLEM_MESSAGES[problem]);
    this.problem = problem;
  }
}

export interface PreparedPhoto {
  blob: Blob;
  ext: PhotoExtension;
  width: number;
  height: number;
  /** Object URL for previews. Call URL.revokeObjectURL when done. */
  previewUrl: string;
}

type Drawable = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      // fall through to <img> (some Safari versions decode HEIC only this way)
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    if (!img.naturalWidth || !img.naturalHeight) throw new Error("empty");
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoPrepareError("decode_failed");
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; ext: PhotoExtension } | null> {
  // Browsers that can't encode WebP silently return PNG; detect and fall back.
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && extensionForType(webp.type) === "webp") return { blob: webp, ext: "webp" };
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (jpeg && extensionForType(jpeg.type) === "jpg") return { blob: jpeg, ext: "jpg" };
  return null;
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const problem: PhotoInputProblem | null = checkPhotoInput(file);
  if (problem) throw new PhotoPrepareError(problem);

  const image = await decode(file);
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new PhotoPrepareError("encode_failed");

    for (const attempt of COMPRESSION_ATTEMPTS) {
      const { width, height } = fitWithin(image.width, image.height, attempt.maxDimension);
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black
      ctx.fillRect(0, 0, width, height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(image.source, 0, 0, width, height);

      const out = await encode(canvas, attempt.quality);
      if (!out) throw new PhotoPrepareError("encode_failed");
      if (fitsLimit(out.blob.size)) {
        return { ...out, width, height, previewUrl: URL.createObjectURL(out.blob) };
      }
    }
    throw new PhotoPrepareError("too_large_after_compression");
  } finally {
    image.close();
  }
}
