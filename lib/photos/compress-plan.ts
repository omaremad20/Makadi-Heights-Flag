/**
 * Pure decisions for photo compression (no DOM), so they can be unit tested.
 * Imports use explicit relative paths so the file also runs under `node --test`.
 */
import {
  PHOTO_ACCEPTED_INPUT_TYPES,
  PHOTO_INPUT_MAX_BYTES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_DIMENSION,
} from "./constants.ts";

export type PhotoInputProblem = "unsupported_type" | "input_too_large" | "empty";

/** Checks the raw file before decoding. Browsers sometimes report HEIC with an empty type. */
export function checkPhotoInput(file: { type: string; size: number; name: string }): PhotoInputProblem | null {
  if (file.size === 0) return "empty";
  if (file.size > PHOTO_INPUT_MAX_BYTES) return "input_too_large";
  const type = file.type.toLowerCase();
  if ((PHOTO_ACCEPTED_INPUT_TYPES as readonly string[]).includes(type)) return null;
  if (type === "" && /\.(heic|heif|jpe?g|png|webp)$/i.test(file.name)) return null;
  return "unsupported_type";
}

/** Scales (w, h) so the longest side is at most `max`, never upscaling. */
export function fitWithin(width: number, height: number, max = PHOTO_MAX_DIMENSION) {
  if (!(width > 0) || !(height > 0)) throw new Error("invalid_dimensions");
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Attempts in order until one fits under the bucket limit. Most photos succeed
 * on the first attempt (~150–300 KB); the rest step down quality, then size.
 */
export const COMPRESSION_ATTEMPTS: ReadonlyArray<{ maxDimension: number; quality: number }> = [
  { maxDimension: PHOTO_MAX_DIMENSION, quality: 0.82 },
  { maxDimension: PHOTO_MAX_DIMENSION, quality: 0.7 },
  { maxDimension: PHOTO_MAX_DIMENSION, quality: 0.55 },
  { maxDimension: 1024, quality: 0.6 },
  { maxDimension: 800, quality: 0.6 },
];

export function fitsLimit(bytes: number): boolean {
  return bytes > 0 && bytes <= PHOTO_MAX_BYTES;
}

/** Maps an encoder output MIME type to our storage extension, or null if unusable. */
export function extensionForType(type: string): "webp" | "jpg" | null {
  if (type === "image/webp") return "webp";
  if (type === "image/jpeg") return "jpg";
  return null;
}

export const PHOTO_PROBLEM_MESSAGES: Record<PhotoInputProblem | "decode_failed" | "too_large_after_compression" | "encode_failed", string> = {
  empty: "This file is empty. Choose another photo.",
  unsupported_type: "Use a JPEG, PNG or WebP photo.",
  input_too_large: "This photo is too large (over 25 MB). Choose a smaller one.",
  decode_failed:
    "This browser can’t open this photo (iPhone HEIC photos often can’t be opened outside Safari). Choose a JPEG or PNG, or take a screenshot of it.",
  too_large_after_compression: "This photo couldn’t be made small enough. Choose another photo.",
  encode_failed: "This photo couldn’t be prepared. Choose another photo.",
};
