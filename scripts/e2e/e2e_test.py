"""
End-to-end tests against the LOCAL stack started by start-stack.sh
(real browser via Playwright + system Chrome, real PostgREST + RLS, mock Auth/Storage).

    E2E_WORK_DIR=... PGHOST=... python3 scripts/e2e/e2e_test.py
"""
import base64
import io
import json
import os
import re
import subprocess
import sys
import time

import requests
from PIL import Image
from playwright.sync_api import expect, sync_playwright

BASE = "http://localhost:3100"
SUPA = "http://localhost:54321"
WORK = os.environ["E2E_WORK_DIR"]
TOKENS = json.load(open(os.path.join(WORK, "env.json")))
PSQL = ["psql", "-h", os.environ["PGHOST"], "-p", os.environ.get("PGPORT", "54329"), "-U", "postgres", "-d", "flag_e2e", "-tAX", "-c"]
results = []
_pages = []


def sql(q):
    return subprocess.check_output(PSQL + [q], text=True).strip()


def check(name, fn):
    t = time.time()
    try:
        fn()
        results.append((name, "PASS", time.time() - t, ""))
        print(f"PASS {name}")
    except Exception as e:  # noqa: BLE001
        results.append((name, "FAIL", time.time() - t, repr(e)[:400]))
        for pg in list(_pages):
            try:
                pg.screenshot(path=os.path.join(WORK, f"fail-{len(results)}.png"), full_page=True)
            except Exception:  # noqa: BLE001
                pass
        print(f"FAIL {name}: {e!r}"[:600])


def image_bytes(w, h, fmt="JPEG"):
    img = Image.new("RGB", (w, h))
    px = img.load()
    for x in range(0, w, 4):  # noisy content so JPEG is large
        for y in range(0, h, 4):
            px[x, y] = ((x * 7) % 255, (y * 13) % 255, (x * y) % 255)
    buf = io.BytesIO()
    img.save(buf, fmt, quality=95)
    return buf.getvalue()


BIG_JPEG = image_bytes(4032, 3024)
SMALL_PNG = image_bytes(600, 800, "PNG")


def session_cookie(token, user_id, email):
    session = {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 3600 * 24 * 365,
        "expires_at": 4102444800,
        "refresh_token": "e2e-refresh",
        "user": {"id": user_id, "email": email, "aud": "authenticated", "role": "authenticated", "app_metadata": {}, "user_metadata": {}},
    }
    value = "base64-" + base64.urlsafe_b64encode(json.dumps(session).encode()).decode().rstrip("=")
    return {"name": "sb-localhost-auth-token", "value": value, "url": BASE}


ADMIN = ("00000000-0000-0000-0000-0000000000a1", "admin@e2e.test")
EMPLOYEE = ("00000000-0000-0000-0000-0000000000e1", "employee@e2e.test")


def fill_application(page, name, unit, headcount=1):
    page.goto(f"{BASE}/application-form")
    page.locator("#full_name").fill(name)
    page.locator("#unit_number").fill(unit)
    for _ in range(headcount - 1):
        page.get_by_label("Increase headcount").click()
    if headcount >= 2:
        page.locator("#partner_name").fill("Sara Tester")
    for i in range(max(0, headcount - 2)):
        page.locator(f"#person-{i}-name").fill(f"Kid Number{chr(65 + i)}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])

        # ------------------------------------------------------------- public form + photos
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        _pages[:] = [page]

        def submit_with_photos():
            fill_application(page, "Omar Photo", "P-101", headcount=3)
            page.get_by_label("Choose a photo for the applicant").set_input_files(
                {"name": "big.jpg", "mimeType": "image/jpeg", "buffer": BIG_JPEG})
            page.get_by_label("Choose a photo for the partner").set_input_files(
                {"name": "p.png", "mimeType": "image/png", "buffer": SMALL_PNG})
            page.get_by_label("Choose a photo for Additional Member 1").set_input_files(
                {"name": "k.png", "mimeType": "image/png", "buffer": SMALL_PNG})
            expect(page.get_by_text(re.compile(r"Ready · \d+ KB"))).to_have_count(3, timeout=20000)
            # every compressed photo is under 1 MiB
            sizes = [int(re.search(r"(\d+) KB", t).group(1)) for t in page.get_by_text(re.compile(r"Ready · \d+ KB")).all_inner_texts()]
            assert all(s <= 1024 for s in sizes), sizes
            page.get_by_role("button", name="Submit application").click()
            expect(page.get_by_role("heading", name="Application submitted successfully")).to_be_visible(timeout=20000)
            expect(page.get_by_text("Photos · 3 of 3 uploaded")).to_be_visible(timeout=30000)
            app_id = sql("select id from applications where unit_number = 'P-101'")
            assert sql(f"select count(*) from application_photos where application_id = '{app_id}' and status = 'active'") == "3"
            ext = sql(f"select string_agg(distinct split_part(storage_path, '.', 2), ',') from application_photos where application_id = '{app_id}'")
            assert ext in ("webp", "jpg"), ext
            keys = sql(f"select string_agg(person_key, ',' order by person_key) from application_photos where application_id = '{app_id}'")
            assert "applicant" in keys and "partner" in keys and re.search(r"[0-9a-f-]{36}", keys), keys
        check("public: application with 3 compressed photos (WebP/JPEG <= 1 MiB) uploads and is linked per person", submit_with_photos)

        def unsupported_heic():
            page.goto(f"{BASE}/application-form")
            page.get_by_label("Choose a photo for the applicant").set_input_files(
                {"name": "IMG_0001.HEIC", "mimeType": "image/heic", "buffer": b"\x00\x00\x00\x18ftypheic" + os.urandom(2000)})
            expect(page.get_by_role("alert").filter(has_text="can’t open this photo")).to_be_visible(timeout=10000)
            page.get_by_label("Choose a photo for the applicant").set_input_files(
                {"name": "doc.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4"})
            expect(page.get_by_role("alert").filter(has_text="Use a JPEG, PNG or WebP photo")).to_be_visible()
        check("public: undecodable HEIC and non-images show clear errors", unsupported_heic)

        def partial_failure_and_retry():
            requests.post(f"{SUPA}/__mock/fail-uploads", json={"pattern": "/partner/", "count": 1})
            fill_application(page, "Retry Person", "R-202", headcount=2)
            page.get_by_label("Choose a photo for the applicant").set_input_files({"name": "a.png", "mimeType": "image/png", "buffer": SMALL_PNG})
            page.get_by_label("Choose a photo for the partner").set_input_files({"name": "b.png", "mimeType": "image/png", "buffer": SMALL_PNG})
            expect(page.get_by_text(re.compile(r"Ready · \d+ KB"))).to_have_count(2, timeout=20000)
            page.get_by_role("button", name="Submit application").click()
            expect(page.get_by_text("Photos · 1 of 2 uploaded")).to_be_visible(timeout=30000)
            expect(page.get_by_text("Your application is saved.")).to_be_visible()
            page.get_by_role("button", name="Retry failed photos").click()
            expect(page.get_by_text("Photos · 2 of 2 uploaded")).to_be_visible(timeout=30000)
            app_id = sql("select id from applications where unit_number = 'R-202'")
            assert sql(f"select count(*) from application_photos where application_id = '{app_id}' and status = 'active'") == "2"
            # the failed attempt's slot is still reserved (expires after 24 h), never reused
            assert sql(f"select count(*) from application_photos where application_id = '{app_id}' and person_key = 'partner'") == "2"
            assert sql("select count(*) from applications where unit_number = 'R-202'") == "1", "no duplicate application"
        check("public: partial upload failure is reported and retried without duplicating anything", partial_failure_and_retry)

        def unsaved_guard():
            fill_application(page, "Guard Test", "G-1")
            page.get_by_role("button", name="Open menu").click()
            page.get_by_role("link", name="Flag", exact=True).click()
            expect(page.get_by_role("heading", name="Unsaved Changes")).to_be_visible()
            page.get_by_role("button", name="Stay on page").click()
            assert page.url.endswith("/application-form")
            assert page.locator("#full_name").input_value() == "Guard Test"
            page.go_back()  # browser Back is guarded too
            expect(page.get_by_role("heading", name="Unsaved Changes")).to_be_visible()
            page.get_by_role("button", name="Stay on page").click()
            assert page.url.endswith("/application-form")
            page.get_by_role("button", name="Open menu").click()
            page.get_by_role("link", name="Flag", exact=True).click()
            page.get_by_role("button", name="Leave page").click()
            page.wait_for_url(re.compile(r"/#flag$"), timeout=15000)
        check("public: unsaved-changes guard on navbar links and browser Back", unsaved_guard)

        def navbar():
            page.goto(f"{BASE}/application-form")
            page.get_by_role("link", name="Makadi Heights — home").click()
            page.wait_for_url(f"{BASE}/", timeout=15000)
            page.get_by_role("button", name="Open menu").click()
            page.get_by_role("link", name="Fill Clubhouse Form").click()
            page.wait_for_url(f"{BASE}/application-form", timeout=15000)
            page.get_by_role("button", name="Open menu").click()
            page.get_by_role("link", name="Dining").click()
            page.wait_for_url(re.compile(r"/#dining$"), timeout=15000)
            page.wait_for_timeout(1600)
            top = page.evaluate("document.getElementById('dining').getBoundingClientRect().top")
            nav = page.evaluate("document.getElementById('site-navbar').offsetHeight")
            assert abs(top - nav) < 40, (top, nav)
            # on the homepage the same link scrolls without navigating
            page.get_by_role("button", name="Open menu").click()
            page.get_by_role("link", name="Flag", exact=True).click()
            page.wait_for_timeout(1200)
            assert page.url.endswith("#flag")
        check("public: logo -> home, Fill Clubhouse Form link, cross-page section links land below the navbar", navbar)

        def homepage_menu():
            page.goto(f"{BASE}/")
            href = page.get_by_role("link", name="View the menu").get_attribute("href")
            assert href.endswith("/storage/v1/object/public/menu/Menu_Serenity_2026.pdf"), href
            assert page.get_by_text("Clubhouse Membership").count() >= 1
        check("public: homepage renders static hotel content and the menu from site_settings", homepage_menu)
        ctx.close()

        # ------------------------------------------------------------- employee
        emp = browser.new_context()
        emp.add_cookies([session_cookie(TOKENS["employee"], *EMPLOYEE)])
        ep = emp.new_page()
        _pages[:] = [ep]

        def employee_blocked():
            ep.goto(f"{BASE}/dashboard/applications")
            assert "/dashboard/sea" in ep.url, ep.url
            ep.goto(f"{BASE}/dashboard/menu")
            assert "/dashboard/sea" in ep.url, ep.url
            r = ep.request.get(f"{BASE}/dashboard/applications/export")
            assert "Application ID" not in r.text(), "employee got CSV data"
            assert ep.get_by_role("link", name="Applications").count() == 0
            # direct database access with the employee token sees nothing
            rows = requests.get(f"{SUPA}/rest/v1/applications?select=id", headers={"apikey": TOKENS["anon"], "Authorization": f"Bearer {TOKENS['employee']}"}).json()
            assert rows == [], rows
        check("employee: applications/menu pages, export and data are not accessible", employee_blocked)
        emp.close()

        # ------------------------------------------------------------- admin
        adm = browser.new_context(viewport={"width": 1280, "height": 900}, accept_downloads=True)
        adm.add_cookies([session_cookie(TOKENS["admin"], *ADMIN)])
        ap = adm.new_page()
        _pages[:] = [ap]

        def admin_list_search_filters():
            ap.goto(f"{BASE}/dashboard/applications")
            expect(ap.get_by_role("heading", name="Applications")).to_be_visible()
            expect(ap.locator("td").get_by_text("Omar Photo", exact=True)).to_be_visible()
            ap.get_by_label("Search applications").fill('x"),or(id.neq.0')
            ap.get_by_role("button", name="Search").click()
            expect(ap.get_by_text("No applications match these filters")).to_be_visible(timeout=15000)
            ap.get_by_label("Search applications").fill("P-101")
            ap.get_by_role("button", name="Search").click()
            expect(ap.locator("td").get_by_text("Omar Photo", exact=True)).to_be_visible(timeout=15000)
            expect(ap.locator("td").get_by_text("Retry Person", exact=True)).to_have_count(0)
            ap.goto(f"{BASE}/dashboard/applications?status=approved")
            expect(ap.get_by_text("No applications match these filters")).to_be_visible()
            ap.goto(f"{BASE}/dashboard/applications?pageSize=10&page=999")
            expect(ap.get_by_text("This page is past the end of the list")).to_be_visible(timeout=15000)
            ap.get_by_role("link", name="Go to the last page").click()
            expect(ap.locator("td").get_by_text("Omar Photo", exact=True)).to_be_visible(timeout=15000)
        check("admin: list, safe search, status filter, out-of-range page", admin_list_search_filters)

        def admin_edit_rules():
            ap.goto(f"{BASE}/dashboard/applications?search=P-101")
            ap.get_by_role("button", name="Review").first.click()
            sheet = ap.get_by_role("dialog")
            sheet.get_by_role("button", name="Approve", exact=True).click()
            ap.get_by_role("alertdialog").get_by_role("button", name="Confirm").click()
            expect(ap.get_by_text("Application marked as approved.")).to_be_visible(timeout=15000)
            app_id = sql("select id from applications where unit_number = 'P-101'")
            assert sql(f"select status || '|' || status_updated_by_email_snapshot from applications where id = '{app_id}'") == "approved|admin@e2e.test"
            # correction keeps approval
            ap.get_by_role("tab", name="Edit").click()
            ap.locator("#edit-full_name").fill("Omar Photos")
            ap.get_by_role("button", name="Save changes").click()
            expect(ap.get_by_text("The approval status is unchanged.")).to_be_visible(timeout=15000)
            assert sql(f"select status from applications where id = '{app_id}'") == "approved"
            # adding a person resets to pending
            ap.get_by_role("tab", name="Edit").click()
            ap.get_by_role("button", name="Add person").click()
            ap.locator("#edit-person-1-name").fill("New Member")
            expect(ap.get_by_text("Saving will send this approved application back to pending")).to_be_visible()
            ap.get_by_role("button", name="Save changes").click()
            expect(ap.get_by_text("went back to pending for re-review")).to_be_visible(timeout=15000)
            assert sql(f"select status || '|' || persons_count from applications where id = '{app_id}'") == "pending|4"
            ap.get_by_role("tab", name="History").click()
            expect(ap.get_by_text("Approval reset to pending for re-review")).to_be_visible()
            expect(ap.get_by_role("tabpanel").get_by_text("Omar Photos")).to_be_visible()
        check("admin: approve, correction keeps approval, adding a person resets it, history shows both", admin_edit_rules)

        def admin_conflict():
            app_id = sql("select id from applications where unit_number = 'R-202'")
            ap.goto(f"{BASE}/dashboard/applications?search=R-202")
            ap.get_by_role("button", name="Review").first.click()
            ap.get_by_role("tab", name="Edit").click()
            # someone else changes it meanwhile
            sql(f"update applications set email = 'other@example.com' where id = '{app_id}'")
            ap.locator("#edit-full_name").fill("Retry Personn")
            ap.get_by_role("button", name="Save changes").click()
            expect(ap.get_by_text("changed by someone else")).to_be_visible(timeout=15000)
            assert sql(f"select full_name from applications where id = '{app_id}'") == "Retry Person"
        check("admin: concurrent edit is rejected (optimistic concurrency)", admin_conflict)

        def admin_photo_replace():
            app_id = sql("select id from applications where unit_number = 'P-101'")
            status_before = sql(f"select status from applications where id = '{app_id}'")
            ap.goto(f"{BASE}/dashboard/applications?search=P-101")
            ap.get_by_role("button", name="Review").first.click()
            ap.get_by_role("tab", name="Photos").click()
            expect(ap.get_by_role("img", name=re.compile("Photo of Omar Photos"))).to_be_visible(timeout=15000)
            ap.get_by_label(re.compile("Choose a new photo for Omar Photos")).set_input_files({"name": "n.png", "mimeType": "image/png", "buffer": SMALL_PNG})
            expect(ap.get_by_text(re.compile("Photo updated for"))).to_be_visible(timeout=30000)
            assert sql(f"select count(*) from application_photos where application_id = '{app_id}' and person_key = 'applicant' and status = 'replaced'") == "1"
            assert sql(f"select status from applications where id = '{app_id}'") == status_before
            assert sql(f"select count(*) from application_revisions where application_id = '{app_id}' and changed_fields = array['photo:applicant'] and changed_by_email_snapshot = 'admin@e2e.test'") == "1"
            # the signed image URL actually serves the private object
            src = ap.get_by_role("img", name=re.compile("Photo of Omar Photos")).get_attribute("src")
            assert requests.get(src).status_code == 200
            # but the object is not public
            path = sql(f"select storage_path from application_photos where application_id = '{app_id}' and person_key = 'applicant' and status = 'active'")
            assert requests.get(f"{SUPA}/storage/v1/object/public/application-photos/{path}").status_code != 200
        check("admin: view private photos via signed URLs and replace one (approval kept, history recorded)", admin_photo_replace)

        def admin_csv():
            sql("update applications set nationality = '=HYPERLINK(\"http://evil\")' where unit_number = 'R-202'")
            with ap.expect_download() as dl:
                ap.goto(f"{BASE}/dashboard/applications")
                ap.get_by_role("link", name="Export CSV").click()
            text = open(dl.value.path(), encoding="utf-8-sig", newline="").read()
            print("CSV:", repr(text[:400]))
            assert text.startswith('"Application ID"'), text[:80]
            assert "\"'=HYPERLINK(\"\"http://evil\"\")\"" in text, "formula not neutralised"
            assert text.count("\r\n") >= 3
        check("admin: CSV export escapes values and neutralises formulas", admin_csv)

        def admin_menu():
            ap.goto(f"{BASE}/dashboard/menu")
            ap.locator("input[type=file]").set_input_files({"name": "New Menu.pdf", "mimeType": "application/pdf", "buffer": b"%PDF-1.4\n%e2e\n"})
            ap.get_by_role("button", name="Replace menu").click()
            expect(ap.get_by_text("Menu updated.")).to_be_visible(timeout=15000)
            path = sql("select value->>'path' from site_settings where key = 'menu'")
            assert re.match(r"^Menu-New-Menu-\d+\.pdf$", path), path
            assert sql("select count(*) from storage.objects where bucket_id = 'menu' and name = 'Menu_Serenity_2026.pdf'") in ("0", "1")  # old file never deleted by the app
            ap.goto(f"{BASE}/")
            assert ap.get_by_role("link", name="View the menu").get_attribute("href").endswith(path)
            # a non-PDF is refused
            ap.goto(f"{BASE}/dashboard/menu")
            ap.locator("input[type=file]").set_input_files({"name": "x.pdf", "mimeType": "application/pdf", "buffer": b"not a pdf"})
            ap.get_by_role("button", name="Replace menu").click()
            expect(ap.get_by_text("Only valid PDF files are allowed.").first).to_be_visible(timeout=15000)
        check("admin: menu replacement updates site_settings and the homepage; invalid PDF refused", admin_menu)

        def mobile_dashboard():
            mob = browser.new_context(viewport={"width": 390, "height": 844})
            mob.add_cookies([session_cookie(TOKENS["admin"], *ADMIN)])
            mp = mob.new_page()
            mp.goto(f"{BASE}/dashboard/applications")
            expect(mp.get_by_text(re.compile("^Omar Photo")).first).to_be_visible(timeout=15000)
            overflow = mp.evaluate("document.querySelector('main').scrollWidth - document.querySelector('main').clientWidth")
            assert overflow <= 1, f"horizontal overflow {overflow}px"
            mp.screenshot(path=os.path.join(WORK, "dashboard-mobile.png"), full_page=True)
            mob.close()
        check("admin: dashboard has no horizontal overflow on a phone", mobile_dashboard)

        ap.screenshot(path=os.path.join(WORK, "dashboard-desktop.png"))
        adm.close()
        browser.close()

    failed = [r for r in results if r[1] == "FAIL"]
    print(f"\n{len(results) - len(failed)} passed, {len(failed)} failed")
    json.dump(results, open(os.path.join(WORK, "e2e-results.json"), "w"), indent=2)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
