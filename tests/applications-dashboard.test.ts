import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { csvCell, toCsv } from "../lib/applications/csv.ts";
import {
  buildApplicationsHref,
  cairoDayStartUtc,
  getPagination,
  nextDay,
  parseApplicationListParams,
} from "../lib/applications/list-params.ts";
import { wouldRequireRereview, type RereviewSnapshot } from "../lib/applications/rereview.ts";
import { buildSearchFilter, escapeLike, quotePostgrestValue } from "../lib/applications/search-filter.ts";

describe("search filter (PostgREST injection)", () => {
  it("quotes and LIKE-escapes every value", () => {
    const f = buildSearchFilter("Omar")!;
    assert.match(f, /^full_name\.ilike\."%Omar%",partner_name\.ilike\."%Omar%",/);
  });
  it("commas, parentheses and dots cannot add filters", () => {
    const f = buildSearchFilter("x,status.eq.approved),or(id.neq.0")!;
    // exactly the 5 column filters, each with a quoted literal
    assert.equal(f.split(/,(?=[a-z_]+\.ilike\.)/).length, 5);
    for (const part of f.split(/,(?=[a-z_]+\.ilike\.)/)) {
      assert.match(part, /^[a-z_]+\.ilike\."%.*%"$/);
    }
  });
  it("escapes quotes, backslashes and LIKE wildcards", () => {
    assert.equal(escapeLike("50%_off\\"), "50\\%\\_off\\\\");
    assert.equal(quotePostgrestValue('a"b\\c'), '"a\\"b\\\\c"');
    assert.equal(buildSearchFilter('%')!.startsWith('full_name.ilike."%\\\\%%"'), true);
  });
  it("matches an application id exactly", () => {
    assert.equal(buildSearchFilter("A39034A3-E7BF-460C-979D-589D4FA540FF"), "id.eq.a39034a3-e7bf-460c-979d-589d4fa540ff");
  });
  it("adds phone variants for numbers typed with a leading zero", () => {
    const f = buildSearchFilter("010 0123 4567")!;
    assert.match(f, /mobile\.ilike\."%1001234567%"/);
  });
  it("ignores blank / control-only input", () => {
    assert.equal(buildSearchFilter("   "), null);
    assert.equal(buildSearchFilter("\u0000\u0007"), null);
  });
});

describe("list params", () => {
  it("falls back to safe defaults for anything invalid", () => {
    const p = parseApplicationListParams({
      page: "-3",
      pageSize: "1000",
      status: "deleted",
      sort: "password",
      dir: "sideways",
      from: "2026-02-31",
      membership: "beach_only",
    });
    assert.equal(p.page, 1);
    assert.equal(p.pageSize, 20);
    assert.equal(p.status, "all");
    assert.equal(p.sort, "created_at");
    assert.equal(p.dir, "desc");
    assert.equal(p.from, "");
    assert.equal(p.membershipType, "all");
  });
  it("swaps reversed date ranges and trims search", () => {
    const p = parseApplicationListParams({ from: "2026-10-31", to: "2026-10-01", search: "  a   b  " });
    assert.equal(p.from, "2026-10-01");
    assert.equal(p.to, "2026-10-31");
    assert.equal(p.search, "a b");
  });
  it("filter changes reset to page 1; explicit page kept", () => {
    const p = parseApplicationListParams({ page: "4", status: "pending" });
    assert.equal(buildApplicationsHref(p, { status: "approved" }), "/dashboard/applications?status=approved");
    assert.equal(buildApplicationsHref(p, { page: 5 }), "/dashboard/applications?status=pending&page=5");
  });
  it("pagination math", () => {
    const p = parseApplicationListParams({ page: "3", pageSize: "10" });
    assert.deepEqual(getPagination(p, 25), { page: 3, pageSize: 10, totalCount: 25, totalPages: 3, from: 21, to: 25 });
    assert.deepEqual(getPagination(p, 0).from, 0);
  });
  it("date filters use Cairo days, including DST", () => {
    assert.equal(cairoDayStartUtc("2026-07-01"), "2026-06-30T21:00:00.000Z"); // UTC+3 (summer)
    assert.equal(cairoDayStartUtc("2026-12-01"), "2026-11-30T22:00:00.000Z"); // UTC+2 (winter)
    assert.equal(nextDay("2026-12-31"), "2027-01-01");
  });
});

describe("CSV export", () => {
  it("neutralises spreadsheet formulas", () => {
    for (const v of ["=HYPERLINK(\"http://x\")", "+1+1", "-2", "@SUM(A1)", "\tcmd", "\rcmd"]) {
      assert.ok(csvCell(v).startsWith(`"'`), v);
    }
    assert.equal(csvCell("+201001234567"), `"'+201001234567"`);
  });
  it("quotes, doubles quotes and handles null", () => {
    assert.equal(csvCell('a "b", c'), '"a ""b"", c"');
    assert.equal(csvCell(null), '""');
    assert.equal(csvCell(3), '"3"');
  });
  it("adds a BOM and CRLF rows", () => {
    const csv = toCsv(["A", "B"], [["1", "x\ny"]]);
    assert.ok(csv.startsWith("﻿\"A\",\"B\"\r\n"));
    assert.ok(csv.includes('"x\ny"'));
  });
});

describe("re-review warning mirrors the database rule", () => {
  const base: RereviewSnapshot = {
    status: "approved",
    period: "month",
    membership_type: "clubhouse_only",
    user_type: "owner",
    unit_number: "A-1",
    partner_name: "Sara Test",
    additional_person_ids: ["a", "b"],
  };
  it("keeps approval for corrections", () => {
    assert.equal(wouldRequireRereview(base, { ...base, partner_name: "Sarah Test" }), false);
    assert.equal(wouldRequireRereview(base, { ...base, additional_person_ids: ["b", "a"] }), false);
  });
  it("resets for eligibility changes", () => {
    for (const change of [
      { period: "week" },
      { membership_type: "clubhouse_and_beach" },
      { user_type: null },
      { unit_number: "A-2" },
      { partner_name: null },
      { additional_person_ids: ["a"] },
      { additional_person_ids: ["a", "b", null] },
      { additional_person_ids: ["a", "c"] },
    ]) {
      assert.equal(wouldRequireRereview(base, { ...base, ...change }), true, JSON.stringify(change));
    }
  });
  it("never warns for non-approved applications", () => {
    assert.equal(wouldRequireRereview({ ...base, status: "pending" }, { ...base, period: "week" }), false);
  });
});
