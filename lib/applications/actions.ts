"use server";

import { revalidatePath } from "next/cache";

import { getAdminContext } from "@/lib/auth/require-admin";
import { applicationFormSchema, toApplicationPayload } from "@/lib/applications/form-schema";
import { APPLICATION_STATUSES, type ApplicationStatusValue } from "@/lib/applications/list-params";
import type { ActionResult, ApplicationDetail } from "@/lib/applications/types";
import { validateApplication } from "@/lib/applications/vaildation";
import { PHOTO_BUCKET } from "@/lib/photos/constants";
import { isPersonKey, isPhotoExtension, isPhotoPath, isUuid } from "@/lib/photos/validation";
import { getApplicationDetail } from "@/lib/services/applications/applications.service";

/*
 * Admin-only server actions. Every action re-checks authorization on the
 * server (getAdminContext -> is_active_approved_admin()) and runs with the
 * admin's own session, so RLS and column grants apply as a second layer.
 * Audit columns, status timestamps and the re-review rule are set by
 * database triggers; nothing here (or in the browser) can set them.
 */

const FORBIDDEN = { ok: false as const, code: "forbidden" as const, message: "Admin access is required." };
const CONFLICT = {
  ok: false as const,
  code: "conflict" as const,
  message: "This application was changed by someone else. Reload it and try again.",
};
const PATH = "/dashboard/applications";

export async function getApplicationDetailAction(id: string): Promise<ActionResult<ApplicationDetail>> {
  if (!isUuid(id)) return { ok: false, code: "invalid", message: "Invalid application." };
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;
  try {
    const detail = await getApplicationDetail(ctx, id);
    return detail ? { ok: true, data: detail } : { ok: false, code: "not_found", message: "Application not found." };
  } catch (e) {
    console.error("[applications] detail failed", e instanceof Error ? e.message : e);
    return { ok: false, code: "failed", message: "The application couldn’t be loaded. Try again." };
  }
}

export async function updateApplicationStatusAction(
  id: string,
  status: ApplicationStatusValue,
  expectedUpdatedAt: string,
): Promise<ActionResult<{ status: ApplicationStatusValue; updated_at: string }>> {
  if (!isUuid(id) || !APPLICATION_STATUSES.includes(status) || typeof expectedUpdatedAt !== "string") {
    return { ok: false, code: "invalid", message: "Invalid status change." };
  }
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const { data, error } = await ctx.supabase
    .from("applications")
    .update({ status })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt) // optimistic concurrency
    .select("status, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[applications] status update failed", error.code);
    return { ok: false, code: "failed", message: "The status couldn’t be updated. Try again." };
  }
  if (!data) return CONFLICT;
  revalidatePath(PATH);
  return { ok: true, data: data as { status: ApplicationStatusValue; updated_at: string } };
}

export async function updateApplicationAction(
  id: string,
  values: unknown,
  expectedUpdatedAt: string,
): Promise<ActionResult<{ status: string; updated_at: string; statusReset: boolean }>> {
  if (!isUuid(id) || typeof expectedUpdatedAt !== "string") {
    return { ok: false, code: "invalid", message: "Invalid request." };
  }
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  // Same rules as the public form (and the database CHECK constraints).
  const parsed = applicationFormSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
    }
    return { ok: false, code: "invalid", message: "Some details need attention.", fieldErrors };
  }
  const checked = validateApplication(toApplicationPayload(parsed.data));
  if (!checked.ok) return { ok: false, code: "invalid", message: "Some details need attention." };

  const { data: current, error: readErr } = await ctx.supabase
    .from("applications")
    .select("status, additional_persons")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, code: "failed", message: "The application couldn’t be loaded. Try again." };
  if (!current) return { ok: false, code: "not_found", message: "Application not found." };

  // Keep each existing person's id (identity + photo). Unknown ids are dropped,
  // so the database assigns a fresh id to genuinely new people.
  const knownIds = new Set(
    ((current.additional_persons ?? []) as Array<{ id?: string }>).map((p) => p.id).filter(Boolean),
  );
  const v = checked.value;
  const additional =
    v.additional_persons?.map((person, i) => {
      const id = parsed.data.additional_persons[i]?.id;
      return id && isUuid(id) && knownIds.has(id) ? { id, ...person } : person;
    }) ?? null;

  const { data, error } = await ctx.supabase
    .from("applications")
    .update({
      period: v.period,
      membership_type: v.membership_type,
      user_type: v.user_type,
      full_name: v.full_name,
      unit_number: v.unit_number,
      mobile: v.mobile,
      email: v.email,
      nationality: v.nationality,
      partner_name: v.partner_name,
      partner_nationality: v.partner_nationality,
      partner_mobile: v.partner_mobile,
      partner_email: v.partner_email,
      additional_persons: additional,
    })
    .eq("id", id)
    .eq("updated_at", expectedUpdatedAt)
    .select("status, updated_at")
    .maybeSingle();

  if (error) {
    console.error("[applications] update failed", error.code, error.message);
    const invalid = ["23514", "23502", "22P02"].includes(error.code);
    return invalid
      ? { ok: false, code: "invalid", message: "Some details were not accepted. Check them and try again." }
      : { ok: false, code: "failed", message: "The changes couldn’t be saved. Try again." };
  }
  if (!data) return CONFLICT;

  revalidatePath(PATH);
  return {
    ok: true,
    data: {
      status: data.status,
      updated_at: data.updated_at,
      statusReset: current.status === "approved" && data.status === "pending",
    },
  };
}

// ---------------------------------------------------------------- photos

export async function reservePhotoReplacementAction(
  applicationId: string,
  personKey: string,
  ext: string,
): Promise<ActionResult<{ path: string; signedUrl: string }>> {
  if (!isUuid(applicationId) || !isPersonKey(personKey) || !isPhotoExtension(ext)) {
    return { ok: false, code: "invalid", message: "Invalid photo request." };
  }
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  // The database re-checks admin status and that the person belongs to the application.
  const { data: path, error } = await ctx.supabase.rpc("admin_reserve_photo_replacement", {
    p_application_id: applicationId,
    p_person_key: personKey,
    p_extension: ext,
  });
  if (error || typeof path !== "string") {
    console.error("[photos] admin reserve failed", error?.code);
    return error?.code === "42501"
      ? FORBIDDEN
      : { ok: false, code: "invalid", message: "This person isn’t on the application anymore. Reload and try again." };
  }

  // Signed with the admin session: storage's INSERT policy only admits paths
  // reserved for an admin replacement, and upsert stays off (no overwrite).
  const { data: signed, error: signErr } = await ctx.supabase.storage.from(PHOTO_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) {
    console.error("[photos] admin sign failed", signErr?.message);
    return { ok: false, code: "failed", message: "Photo upload isn’t available right now. Try again." };
  }
  return { ok: true, data: { path, signedUrl: signed.signedUrl } };
}

export async function confirmPhotoReplacementAction(path: string): Promise<ActionResult> {
  if (!isPhotoPath(path)) return { ok: false, code: "invalid", message: "Invalid photo." };
  const ctx = await getAdminContext();
  if (!ctx) return FORBIDDEN;

  const { error } = await ctx.supabase.rpc("admin_confirm_photo_replacement", { p_storage_path: path });
  if (error) {
    console.error("[photos] admin confirm failed", error.code);
    if (error.code === "42501") return FORBIDDEN;
    if (error.code === "PT409") return { ok: false, code: "conflict", message: "This photo was already saved or didn’t finish uploading." };
    return { ok: false, code: "failed", message: "The photo couldn’t be saved. Try again." };
  }
  revalidatePath(PATH);
  return { ok: true };
}
