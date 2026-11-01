import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { checkPhotoInput, COMPRESSION_ATTEMPTS, extensionForType, fitsLimit, fitWithin } from "../lib/photos/compress-plan.ts";
import { PHOTO_MAX_BYTES, PHOTO_MAX_DIMENSION } from "../lib/photos/constants.ts";
import { isBoundedList, isPersonKey, isPhotoPath, isUuid } from "../lib/photos/validation.ts";

describe("photo input checks", () => {
  it("accepts common photo types and HEIC with an empty MIME type", () => {
    assert.equal(checkPhotoInput({ type: "image/jpeg", size: 10, name: "a.jpg" }), null);
    assert.equal(checkPhotoInput({ type: "image/heic", size: 10, name: "a.heic" }), null);
    assert.equal(checkPhotoInput({ type: "", size: 10, name: "IMG_1.HEIC" }), null);
  });
  it("rejects other files, empty files and huge files", () => {
    assert.equal(checkPhotoInput({ type: "application/pdf", size: 10, name: "a.pdf" }), "unsupported_type");
    assert.equal(checkPhotoInput({ type: "image/svg+xml", size: 10, name: "a.svg" }), "unsupported_type");
    assert.equal(checkPhotoInput({ type: "image/gif", size: 10, name: "a.gif" }), "unsupported_type");
    assert.equal(checkPhotoInput({ type: "", size: 10, name: "run.exe" }), "unsupported_type");
    assert.equal(checkPhotoInput({ type: "image/jpeg", size: 0, name: "a.jpg" }), "empty");
    assert.equal(checkPhotoInput({ type: "image/jpeg", size: 26 * 1024 * 1024, name: "a.jpg" }), "input_too_large");
  });
});

describe("resizing", () => {
  it("caps the longest side and keeps the aspect ratio", () => {
    assert.deepEqual(fitWithin(4032, 3024), { width: PHOTO_MAX_DIMENSION, height: 960 });
    assert.deepEqual(fitWithin(3024, 4032), { width: 960, height: PHOTO_MAX_DIMENSION });
  });
  it("never upscales", () => {
    assert.deepEqual(fitWithin(640, 480), { width: 640, height: 480 });
  });
  it("rejects invalid dimensions", () => {
    assert.throws(() => fitWithin(0, 100));
  });
  it("attempts step down and stay within limits", () => {
    for (const a of COMPRESSION_ATTEMPTS) {
      assert.ok(a.maxDimension <= PHOTO_MAX_DIMENSION && a.quality > 0 && a.quality <= 1);
    }
  });
});

describe("encoder output", () => {
  it("only accepts WebP/JPEG (PNG fallback from browsers without WebP encoding is rejected)", () => {
    assert.equal(extensionForType("image/webp"), "webp");
    assert.equal(extensionForType("image/jpeg"), "jpg");
    assert.equal(extensionForType("image/png"), null);
  });
  it("enforces the 1 MiB bucket limit", () => {
    assert.equal(fitsLimit(PHOTO_MAX_BYTES), true);
    assert.equal(fitsLimit(PHOTO_MAX_BYTES + 1), false);
    assert.equal(fitsLimit(0), false);
  });
});

describe("API input validation", () => {
  const app = "a39034a3-e7bf-460c-979d-589d4fa540ff";
  const id = "7c07cc37-ec3d-474a-b96c-04c548cf423b";
  it("person keys", () => {
    assert.ok(isPersonKey("applicant") && isPersonKey("partner") && isPersonKey(id));
    for (const bad of ["../x", "applicant/..", "ADMIN", id.toUpperCase(), "", 1, null]) assert.equal(isPersonKey(bad), false);
  });
  it("photo paths cannot be manipulated", () => {
    assert.ok(isPhotoPath(`${app}/applicant/${id}.webp`));
    assert.ok(isPhotoPath(`${app}/${id}/${id}.jpg`));
    for (const bad of [
      `${app}/applicant/../../menu/Menu.pdf`,
      `${app}/applicant/${id}.png`,
      `/${app}/applicant/${id}.webp`,
      `${app}/applicant/${id}.webp?x=1`,
      `menu/Menu_Serenity_2026.pdf`,
    ]) {
      assert.equal(isPhotoPath(bad), false, bad);
    }
  });
  it("lists are bounded and duplicate-free", () => {
    assert.ok(isBoundedList(["applicant", "partner"], isPersonKey));
    assert.equal(isBoundedList([], isPersonKey), false);
    assert.equal(isBoundedList(["applicant", "applicant"], isPersonKey), false);
    assert.equal(isBoundedList(Array.from({ length: 23 }, () => id), isPersonKey), false);
    assert.equal(isUuid(app), true);
  });
});
