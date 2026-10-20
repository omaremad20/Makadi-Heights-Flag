import { toApplicationPayload, type ApplicationFormValues } from "@/lib/applications/form-schema";
import { validateApplication } from "@/lib/applications/vaildation";
import { getGuestClient } from "@/lib/supabase/guest-client";

export type SubmitResult = { ok: true } | { ok: false; message: string };

/**
 * Direct browser INSERT as `anon`.
 * - No .select()/returning: anon has no SELECT, so the row (and its id) can't be read back.
 * - Only the 13 permitted columns are sent; the database sets status = 'pending'.
 * - Errors are mapped to generic messages. Codes are logged, never values (personal data).
 */
export async function submitApplication(values: ApplicationFormValues): Promise<SubmitResult> {
  const checked = validateApplication(toApplicationPayload(values));
  if (!checked.ok) {
    return { ok: false, message: "Some details need attention. Check the highlighted fields and try again." };
  }

  try {
    const payload = {
      ...checked.value,
    };
    const { error } = await getGuestClient()
      .from("applications")
      .insert(payload);
    if (!error) return { ok: true };

    console.error("Application insert failed", error.code, error.message);
    switch (error.code) {
      case "42501":
        return { ok: false, message: "Applications can’t be accepted right now. Try again later or contact the community office." };
      case "23514":
      case "23502":
      case "22P02":
        return { ok: false, message: "Some details were not accepted. Check them and try again." };
      default:
        return { ok: false, message: "Your application wasn’t submitted. Check your connection and try again. Your details are still here." };
    }
  } catch (error) {
    console.log(error)
    return { ok: false, message: "Your application wasn’t submitted. Check your connection and try again. Your details are still here." };
  }
}