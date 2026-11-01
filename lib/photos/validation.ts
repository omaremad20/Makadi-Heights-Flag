/** Input validation shared by the photo API routes and server actions. */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PERSON_KEY_RE = /^(applicant|partner|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const PHOTO_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(applicant|partner|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$/;

export const MAX_PHOTOS_PER_REQUEST = 22;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

export function isPersonKey(v: unknown): v is string {
  return typeof v === "string" && PERSON_KEY_RE.test(v);
}

export function isPhotoPath(v: unknown): v is string {
  return typeof v === "string" && PHOTO_PATH_RE.test(v);
}

export function isPhotoExtension(v: unknown): v is "webp" | "jpg" {
  return v === "webp" || v === "jpg";
}

/** A non-empty, duplicate-free array of at most MAX_PHOTOS_PER_REQUEST items that all pass `check`. */
export function isBoundedList<T>(v: unknown, check: (x: unknown) => x is T): v is T[] {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_PHOTOS_PER_REQUEST &&
    new Set(v).size === v.length &&
    v.every(check)
  );
}
