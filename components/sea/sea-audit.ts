import type { SupabaseClient } from "@supabase/supabase-js";

export type SeaAudit = {
  created_at: string;
  updated_at: string;
  created_by: string | null;
  last_updated_by: string | null;
  created_by_email: string | null;
  last_updated_by_email: string | null;
  last_updated_by_name: string | null;
};

export type SeaAuditResult =
  | { status: "ok"; audit: SeaAudit }
  | { status: "unauthorized" } // normal: not an active+approved admin (0 rows or no grant)
  | { status: "error" };

const str = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" ? v : null;

/** Reads public.sea_admin with the caller's session. Authorization is entirely the DB's job. */
export async function fetchSeaAudit(
  supabase: SupabaseClient,
): Promise<SeaAuditResult> {
  const { data, error } = await supabase.from("sea_admin").select("*");

  if (error) {
    // anon / non-granted roles get "permission denied" — also a normal authorization outcome.
    if (error.code === "42501") return { status: "unauthorized" };
    console.error("[sea] sea_admin query failed", {
      code: error.code,
      message: error.message,
    });
    return { status: "error" };
  }
  if (!Array.isArray(data) || data.length === 0)
    return { status: "unauthorized" };

  const row = data[0] as Record<string, unknown>;
  const created_at = str(row.created_at);
  const updated_at = str(row.updated_at);
  if (!created_at || !updated_at) {
    console.error("[sea] sea_admin returned an unexpected shape");
    return { status: "error" };
  }
  return {
    status: "ok",
    audit: {
      created_at,
      updated_at,
      created_by: str(row.created_by),
      last_updated_by: str(row.last_updated_by),
      created_by_email: str(row.created_by_email_snapshot),
      last_updated_by_email: str(row.last_updated_by_email_snapshot),
      last_updated_by_name: str(row.last_updated_by_name_snapshot),
    },
  };
}
