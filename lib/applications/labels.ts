import { MEMBERSHIP_TYPE_LABELS, PERIOD_LABELS, USER_TYPE_LABELS } from "@/lib/applications/form-schema";

/** Display helpers for values stored in the database (tolerate unknown/legacy values). */
export function periodLabel(v: string | null | undefined): string {
  return (v && PERIOD_LABELS[v as keyof typeof PERIOD_LABELS]) || v || "—";
}
export function membershipLabel(v: string | null | undefined): string {
  return (v && MEMBERSHIP_TYPE_LABELS[v as keyof typeof MEMBERSHIP_TYPE_LABELS]) || v || "—";
}
export function userTypeLabel(v: string | null | undefined): string {
  return (v && USER_TYPE_LABELS[v as keyof typeof USER_TYPE_LABELS]) || v || "—";
}

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const DATETIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Cairo",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** Dates are always shown in Cairo time, the community's time zone. */
export function formatDate(iso: string | null | undefined): string {
  return iso ? DATE_FMT.format(new Date(iso)) : "—";
}
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? DATETIME_FMT.format(new Date(iso)) : "—";
}

export const FIELD_LABELS: Record<string, string> = {
  period: "Period",
  membership_type: "Membership",
  user_type: "Applicant type",
  full_name: "Full name",
  unit_number: "Unit",
  mobile: "Mobile",
  email: "Email",
  nationality: "Nationality",
  partner_name: "Partner name",
  partner_nationality: "Partner nationality",
  partner_mobile: "Partner mobile",
  partner_email: "Partner email",
  additional_persons: "Additional people",
  persons_count: "People",
  status: "Status",
};
