/** Shared limits for applicant photos (browser + server). Keep in sync with the bucket config. */

/** Hard limit enforced by the `application-photos` bucket. */
export const PHOTO_MAX_BYTES = 1024 * 1024;

/** Longest side after resizing. */
export const PHOTO_MAX_DIMENSION = 1280;

/** Reject absurd inputs before trying to decode them (protects low-memory phones). */
export const PHOTO_INPUT_MAX_BYTES = 25 * 1024 * 1024;

/** Inputs we try to decode. HEIC/HEIF only decode in browsers that support them (mostly Safari). */
export const PHOTO_ACCEPTED_INPUT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

/** `accept` attribute for <input type="file">. */
export const PHOTO_ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export type PhotoExtension = "webp" | "jpg";

export const PHOTO_BUCKET = "application-photos";
