import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type {
  MutationResult,
  Profile,
  ProfileDetails,
  ProfileFilters,
  ProfilesPage,
} from "@/lib/profiles/types";

// Only the columns each screen needs. No `select("*")`, no audit fields in the list.
const LIST_COLUMNS =
  "id, email, full_name, phone, avatar_url, role, is_active, approved, job_title" as const;
const DETAIL_COLUMNS =
  "id, email, full_name, phone, avatar_url, role, is_active, approved, approved_by, approved_by_email_snapshot, job_title, created_at, updated_at, last_updated_by, last_updated_by_email_snapshot" as const;

const SEARCH_COLUMNS = ["full_name", "email", "phone", "job_title"] as const;

/**
 * The term is interpolated into a PostgREST `or=(...)` expression, so characters
 * that carry meaning there are removed, and `_` is escaped as a literal for ILIKE.
 */
function sanitizeSearchTerm(raw: string): string {
  return raw
    .replace(/[\\%*,()"]/g, " ")
    .replace(/_/g, "\\_")
    .replace(/\s+/g, " ")
    .trim();
}

function listQuery(supabase: SupabaseClient, filters: ProfileFilters, head: boolean) {
  let query = supabase.from("profiles").select(LIST_COLUMNS, { count: "exact", head });

  if (filters.role !== "all") query = query.eq("role", filters.role);
  if (filters.status !== "all") query = query.eq("is_active", filters.status === "active");
  if (filters.approved !== "all") query = query.eq("approved", filters.approved === "true");

  const term = sanitizeSearchTerm(filters.search);
  if (term) {
    const pattern = `*${term}*`; // `*` is PostgREST's wildcard alias for `%`
    query = query.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.${pattern}`).join(","));
  }
  return query;
}

export async function getProfiles(filters: ProfileFilters): Promise<ProfilesPage> {
  const supabase = await createClient();
  const from = (filters.page - 1) * filters.pageSize;
  const to = from + filters.pageSize - 1; // range() is inclusive on both ends

  const { data, count, error } = await listQuery(supabase, filters, false)
    .order("full_name", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true }) // tiebreaker => stable pages
    .range(from, to);

  if (error) {
    // PGRST103: requested page is beyond the last row. Fetch only the total so the
    // page can redirect to the real last page.
    if (error.code === "PGRST103") {
      const { count: total, error: countError } = await listQuery(supabase, filters, true);
      if (!countError) return { profiles: [], totalCount: total ?? 0 };
      console.error("[profiles.service] count fallback failed", {
        code: countError.code,
        message: countError.message,
      });
      throw new Error("Failed to load profiles.");
    }
    console.error("[profiles.service] getProfiles failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Failed to load profiles.");
  }

  return { profiles: (data ?? []) as Profile[], totalCount: count ?? 0 };
}

export async function getProfileById(id: string): Promise<ProfileDetails | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[profiles.service] getProfileById failed", {
      code: error.code,
      message: error.message,
    });
    throw new Error("Failed to load profile.");
  }
  return (data as ProfileDetails | null) ?? null;
}

/**
 * Sends ONLY the business field. Audit columns are derived by the DB trigger.
 * `.eq("role","employee")` is a UX guard for clearer failures; RLS + the trigger
 * remain the real enforcement.
 */
async function updateEmployee(
  userId: string,
  patch: { approved: boolean } | { is_active: boolean },
): Promise<MutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(patch)
    .eq("id", userId)
    .eq("role", "employee")
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("[profiles.service] update failed", {
      code: error.code,
      message: error.message,
    });
    // P0001 = trigger rejection, 42501 = RLS / privilege rejection
    if (error.code === "P0001" || error.code === "42501") {
      return { ok: false, code: "forbidden", message: "You are not allowed to change this user." };
    }
    return { ok: false, code: "failed", message: "Something went wrong. Please try again." };
  }

  // RLS filters rows silently: zero rows means "not found / no longer an employee / not permitted".
  if (!data) {
    return {
      ok: false,
      code: "not_updated",
      message: "This user could not be updated. They may have changed since the page loaded.",
    };
  }
  return { ok: true };
}

export function setEmployeeApproval(userId: string, approved: boolean) {
  return updateEmployee(userId, { approved });
}

/** Soft delete. There is intentionally no `.delete()` call anywhere. */
export function deactivateEmployee(userId: string) {
  return updateEmployee(userId, { is_active: false });
}