import type { SubmittedApplication } from "../applications/api-types.ts";
import type { PhotoJob } from "./photo-upload-flow.ts";

type SlotLike = { status: string; photo?: { blob: Blob; ext: "webp" | "jpg" } };

/**
 * Maps the form's photo slots to the person keys the database assigned:
 *   "applicant"     -> "applicant"
 *   "partner"       -> "partner" (only if the saved application has a partner)
 *   "additional:<i>"-> id of the i-th saved additional person
 * Slots without a ready photo, or that no longer match a saved person, are skipped.
 */
export function buildPhotoJobs(
  slots: Record<string, SlotLike>,
  application: Pick<SubmittedApplication, "partner_name" | "additional_persons">,
): Array<PhotoJob & { label: string }> {
  const jobs: Array<PhotoJob & { label: string }> = [];
  for (const [slot, state] of Object.entries(slots)) {
    if (state.status !== "ready" || !state.photo) continue;

    let personKey: string | undefined;
    let label: string;
    if (slot === "applicant") {
      personKey = "applicant";
      label = "Applicant";
    } else if (slot === "partner") {
      personKey = application.partner_name ? "partner" : undefined;
      label = "Partner";
    } else {
      const index = Number(slot.startsWith("additional:") ? slot.slice("additional:".length) : NaN);
      const person = Number.isInteger(index) ? application.additional_persons?.[index] : undefined;
      personKey = person?.id;
      label = person?.name ?? `Additional Member ${index + 1}`;
    }
    if (personKey) jobs.push({ personKey, blob: state.photo.blob, ext: state.photo.ext, label });
  }
  return jobs;
}
