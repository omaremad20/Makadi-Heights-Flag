import type { NextRequest } from "next/server";

import { getAdminContext } from "@/lib/auth/require-admin";
import { toCsv } from "@/lib/applications/csv";
import { parseApplicationListParams } from "@/lib/applications/list-params";
import { APPLICATION_COLUMNS, type ApplicationRow } from "@/lib/applications/types";
import { applyListFilters } from "@/lib/services/applications/applications.service";

const MAX_EXPORT_ROWS = 5000;

/**
 * CSV export of the CURRENT filtered list (admins only). Values are escaped and
 * protected against spreadsheet formula injection (lib/applications/csv.ts).
 */
export async function GET(request: NextRequest) {
  const ctx = await getAdminContext();
  if (!ctx) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });

  const params = parseApplicationListParams(Object.fromEntries(request.nextUrl.searchParams));
  const query = applyListFilters(ctx.supabase.from("applications").select(APPLICATION_COLUMNS), params)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(MAX_EXPORT_ROWS);
  const { data, error } = await query;
  if (error) {
    console.error("[applications] export failed", error.code);
    return new Response("Export failed", { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const rows = (data ?? []) as ApplicationRow[];
  const csv = toCsv(
    [
      "Application ID",
      "Submitted (UTC)",
      "Status",
      "Full name",
      "Unit",
      "Membership",
      "Period",
      "Applicant type",
      "People",
      "Mobile",
      "Email",
      "Nationality",
      "Partner",
      "Partner mobile",
      "Additional people",
    ],
    rows.map((a) => [
      a.id,
      a.created_at,
      a.status,
      a.full_name,
      a.unit_number,
      a.membership_type,
      a.period,
      a.user_type,
      a.persons_count,
      a.mobile,
      a.email,
      a.nationality,
      a.partner_name,
      a.partner_mobile,
      (a.additional_persons ?? []).map((p) => (p.relative ? `${p.name} (${p.relative})` : p.name)).join("; "),
    ]),
  );

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="applications-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
