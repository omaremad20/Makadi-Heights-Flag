import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";

/**
 * Proves lib/config/hotel.ts is an exact copy of the production `hotel` row:
 * re-serialises the static config the way Postgres prints jsonb (keys ordered
 * by length, then bytewise; ", " and ": " separators) and compares the md5
 * with the hash checked by supabase/pending/…_drop_hotel.sql.
 */
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://qnyhugdkhackdrnufxno.supabase.co";
const { AQUAPARK, BEACH_ACCESS_METHODS, DINING } = await import("../lib/config/hotel.ts");

function jsonbText(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(jsonbText).join(", ")}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort((a, b) => Buffer.byteLength(a) - Buffer.byteLength(b) || (a < b ? -1 : a > b ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}: ${jsonbText((v as Record<string, unknown>)[k])}`).join(", ")}}`;
  }
  return JSON.stringify(v);
}

describe("static hotel config", () => {
  it("matches the production hotel row byte for byte (md5 8820f978…)", () => {
    const text = jsonbText({ beach_access_methods: BEACH_ACCESS_METHODS, aquapark: AQUAPARK, dining: DINING });
    assert.equal(createHash("md5").update(text).digest("hex"), "8820f9781723535becb0eadb23868a72");
  });
});
