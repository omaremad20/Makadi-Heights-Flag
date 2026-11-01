import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildMenuObjectName } from "../lib/services/settings/menu-name.ts";

const MENU_PATH_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.pdf$/; // same as site_settings_menu_shape_chk

describe("menu object names", () => {
  it("are unique, safe and accepted by the site_settings CHECK", () => {
    for (const name of ["Menu Serenity 2026.pdf", "_x.PDF", "../../etc/passwd.pdf", "مينيو.pdf", "a".repeat(300) + ".pdf", ".pdf"]) {
      const out = buildMenuObjectName(name, 1730000000000);
      assert.match(out, MENU_PATH_RE, name);
      assert.ok(!out.includes("/") && !out.includes(".."), out);
      assert.ok(out.endsWith("-1730000000000.pdf"));
    }
  });
  it("never reuses an existing membership PDF name", () => {
    assert.notEqual(buildMenuObjectName("BEACH_ONLY_2026.pdf"), "BEACH_ONLY_2026.pdf");
  });
});
