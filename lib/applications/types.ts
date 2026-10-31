/** Row shapes used by the admin dashboard (columns selected explicitly). */

// A type alias (not an interface) so it is assignable to the PDF generator's indexed person type.
export type AdditionalPersonRow = {
  id?: string;
  name: string;
  relative?: string;
  mobile?: string;
};

export interface ApplicationRow {
  id: string;
  created_at: string;
  updated_at: string;
  period: string;
  membership_type: string | null;
  user_type: string | null;
  full_name: string;
  unit_number: string;
  mobile: string | null;
  email: string | null;
  nationality: string | null;
  partner_name: string | null;
  partner_nationality: string | null;
  partner_mobile: string | null;
  partner_email: string | null;
  additional_persons: AdditionalPersonRow[] | null;
  persons_count: number;
  status: "pending" | "approved" | "rejected" | "cancelled";
  status_updated_at: string | null;
  status_updated_by_email_snapshot: string | null;
  last_updated_by_email_snapshot: string | null;
}

export const APPLICATION_COLUMNS =
  "id, created_at, updated_at, period, membership_type, user_type, full_name, unit_number, mobile, email, nationality, partner_name, partner_nationality, partner_mobile, partner_email, additional_persons, persons_count, status, status_updated_at, status_updated_by_email_snapshot, last_updated_by_email_snapshot";

export interface PhotoView {
  personKey: string;
  personLabel: string;
  /** Short-lived signed URL (private bucket); null if no current photo. */
  url: string | null;
  uploadedAt: string | null;
  replacedCount: number;
}

export interface RevisionRow {
  id: number;
  changed_at: string;
  changed_by_email_snapshot: string | null;
  changed_fields: string[];
  old_values: Record<string, unknown>;
  new_values: Record<string, unknown>;
  status_reset_for_review: boolean;
}

export interface ApplicationDetail {
  application: ApplicationRow;
  photos: PhotoView[];
  revisions: RevisionRow[];
}

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; code: "forbidden" | "not_found" | "conflict" | "invalid" | "failed"; message: string; fieldErrors?: Record<string, string> };
