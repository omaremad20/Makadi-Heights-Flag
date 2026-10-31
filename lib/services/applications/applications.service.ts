import "server-only";

import type { AdminContext } from "@/lib/auth/require-admin";
import {
  APPLICATION_STATUSES,
  cairoDayStartUtc,
  nextDay,
  type ApplicationListParams,
} from "@/lib/applications/list-params";
import { buildSearchFilter } from "@/lib/applications/search-filter";
import {
  APPLICATION_COLUMNS,
  type ApplicationDetail,
  type ApplicationRow,
  type PhotoView,
  type RevisionRow,
} from "@/lib/applications/types";
import { PHOTO_BUCKET } from "@/lib/photos/constants";

const SIGNED_VIEW_SECONDS = 300;

type Supabase = AdminContext["supabase"];

// Supabase's query builder types are deep; a structural alias keeps this readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Query = any;

/** Applies every list filter (not paging/sorting). Shared by the list and the CSV export. */
export function applyListFilters(query: Query, p: ApplicationListParams): Query {
  let q = query;
  if (p.status !== "all") q = q.eq("status", p.status);
  if (p.membershipType !== "all") q = q.eq("membership_type", p.membershipType);
  if (p.userType !== "all") q = q.eq("user_type", p.userType);
  if (p.period !== "all") q = q.eq("period", p.period);
  if (p.from) q = q.gte("created_at", cairoDayStartUtc(p.from));
  if (p.to) q = q.lt("created_at", cairoDayStartUtc(nextDay(p.to)));
  const search = buildSearchFilter(p.search);
  if (search) q = q.or(search);
  return q;
}

export async function listApplications(ctx: AdminContext, p: ApplicationListParams) {
  const fromRow = (p.page - 1) * p.pageSize;
  let query = ctx.supabase.from("applications").select(APPLICATION_COLUMNS, { count: "exact" });
  query = applyListFilters(query, p)
    .order(p.sort, { ascending: p.dir === "asc", nullsFirst: false })
    .order("id", { ascending: true }) // stable paging
    .range(fromRow, fromRow + p.pageSize - 1);

  const { data, count, error } = await query;
  if (error?.code === "PGRST103") {
    // Page past the end: PostgREST answers 416 without a count. Count separately
    // so the page can offer the real last page.
    const { count: total, error: countErr } = await applyListFilters(
      ctx.supabase.from("applications").select("id", { count: "exact", head: true }),
      p,
    );
    if (countErr) throw new Error(`applications count failed: ${countErr.code}`);
    return { rows: [] as ApplicationRow[], totalCount: total ?? 0 };
  }
  if (error) throw new Error(`applications list failed: ${error.code}`);
  return { rows: (data ?? []) as ApplicationRow[], totalCount: count ?? 0 };
}

export async function getApplicationStats(ctx: AdminContext) {
  const counts = await Promise.all(
    APPLICATION_STATUSES.map(async (status) => {
      const { count, error } = await ctx.supabase
        .from("applications")
        .select("id", { count: "exact", head: true })
        .eq("status", status);
      if (error) throw new Error(`stats failed: ${error.code}`);
      return [status, count ?? 0] as const;
    }),
  );
  const stats = Object.fromEntries(counts) as Record<(typeof APPLICATION_STATUSES)[number], number>;
  return { ...stats, total: counts.reduce((sum, [, n]) => sum + n, 0) };
}

function personLabel(app: ApplicationRow, key: string): string {
  if (key === "applicant") return `${app.full_name} (applicant)`;
  if (key === "partner") return `${app.partner_name ?? "Partner"} (partner)`;
  const p = app.additional_persons?.find((x) => x.id === key);
  return p ? p.name : "Removed person";
}

export async function getApplicationDetail(ctx: AdminContext, id: string): Promise<ApplicationDetail | null> {
  const { data: app, error } = await ctx.supabase
    .from("applications")
    .select(APPLICATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`application read failed: ${error.code}`);
  if (!app) return null;
  const application = app as ApplicationRow;

  const [{ data: photoRows, error: photoErr }, { data: revisions, error: revErr }] = await Promise.all([
    ctx.supabase
      .from("application_photos")
      .select("person_key, storage_path, status, uploaded_at")
      .eq("application_id", id)
      .in("status", ["active", "replaced"]),
    ctx.supabase
      .from("application_revisions")
      .select("id, changed_at, changed_by_email_snapshot, changed_fields, old_values, new_values, status_reset_for_review")
      .eq("application_id", id)
      .order("changed_at", { ascending: false })
      .limit(50),
  ]);
  if (photoErr) throw new Error(`photos read failed: ${photoErr.code}`);
  if (revErr) throw new Error(`revisions read failed: ${revErr.code}`);

  const rows = (photoRows ?? []) as Array<{ person_key: string; storage_path: string; status: string; uploaded_at: string | null }>;
  const active = rows.filter((r) => r.status === "active");

  // Signed URLs are created with the ADMIN's session: the storage SELECT policy
  // (is_active_approved_admin) is enforced; nothing is ever public.
  let signed: Array<{ path: string | null; signedUrl: string | null }> = [];
  if (active.length > 0) {
    const { data, error: signErr } = await ctx.supabase.storage
      .from(PHOTO_BUCKET)
      .createSignedUrls(active.map((r) => r.storage_path), SIGNED_VIEW_SECONDS);
    if (signErr) console.error("[applications] signing photo views failed", signErr.message);
    signed = (data ?? []).map((d) => ({ path: d.path, signedUrl: d.signedUrl }));
  }
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]));

  const keys = [
    "applicant",
    ...(application.partner_name ? ["partner"] : []),
    ...(application.additional_persons ?? []).map((p) => p.id).filter((x): x is string => Boolean(x)),
  ];
  const photos: PhotoView[] = keys.map((key) => {
    const current = active.find((r) => r.person_key === key);
    return {
      personKey: key,
      personLabel: personLabel(application, key),
      url: current ? (urlByPath.get(current.storage_path) ?? null) : null,
      uploadedAt: current?.uploaded_at ?? null,
      replacedCount: rows.filter((r) => r.person_key === key && r.status === "replaced").length,
    };
  });

  return { application, photos, revisions: (revisions ?? []) as RevisionRow[] };
}

export type { Supabase };
