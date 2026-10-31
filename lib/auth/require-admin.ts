import "server-only";

import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

export type AdminContext = { supabase: ServerClient; userId: string; email: string | null };

/**
 * Server-side admin check used by every admin-only page, server action and
 * route handler. Uses the database's own is_active_approved_admin()
 * (role = 'admin' AND approved AND is_active), the single authorization rule
 * also enforced by RLS. Returns null when the caller is not an active,
 * approved admin (including employees and signed-out users).
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("is_active_approved_admin");
  if (error) {
    console.error("[auth] admin check failed", error.code);
    return null; // fail closed
  }
  return data === true ? { supabase, userId: user.id, email: user.email ?? null } : null;
}
