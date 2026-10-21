import { isValidPhoneNumber } from "libphonenumber-js/max";
import { z } from "zod";

import {
  MAX_ADDITIONAL_PERSONS,
  MAX_TOTAL_HEADCOUNT,
  MEMBERSHIP_TYPES,
  PERIODS,
  USER_TYPES,
  validateApplication,
  type MembershipType,
  type Period,
  type UserType,
} from "@/lib/applications/vaildation";

/** Human-readable labels. The submitted values are the exact database enum values. */
export const PERIOD_LABELS: Record<Period, string> = {
  week: "Week",
  "10-days": "10 Days",
  month: "1 Month",
  "3months": "3 Months",
  "6months": "6 Months",
  "1year": "1 Year",
};

/** Supported membership types and user-friendly labels. */
export const MEMBERSHIP_TYPE_LABELS: Record<MembershipType, string> = {
  clubhouse_only: "Clubhouse Only",
  clubhouse_and_beach: "Clubhouse & Beach",
};

/**
 * Frontend-only availability. These stay in the database enum and in the selector (disabled),
 * but cannot be chosen or submitted from this form.
 */
export const UNAVAILABLE_PERIODS: readonly Period[] = ["6months", "1year"];

export const USER_TYPE_LABELS: Record<UserType, string> = {
  owner: "Owner",
  "tenant-vistior": "Tenant / Visitor", // value spelled exactly as in the database enum
  "non-makadi-resident": "Non-Makadi resident",
};

/**
 * Form state is all strings (what inputs produce). The rules themselves live in
 * lib/applications/validation.ts, which mirrors the database CHECK constraints,
 * so Zod only delegates to it. One rule set, no drift.
 */
const personSchema = z.object({
  name: z.string(),
  relative: z.string(),
  mobile: z.string(),
});

export const applicationFormSchema = z
  .object({
    period: z.enum(PERIODS),
    membership_type: z.enum(MEMBERSHIP_TYPES),
    user_type: z.union([z.enum(USER_TYPES), z.literal("")]),
    full_name: z.string(),
    unit_number: z.string(),
    mobile: z.string(),
    email: z.string(),
    nationality: z.string(),
    partner_name: z.string(),
    partner_nationality: z.string(),
    partner_mobile: z.string(),
    partner_email: z.string(),
    additional_persons: z.array(personSchema),
  })
  .superRefine((values, ctx) => {
    const payload = toApplicationPayload(values);
    const result = validateApplication(payload);
    const errors: Record<string, string> = result.ok
      ? {}
      : { ...result.errors };

    // On top of the DB's E.164 shape rule: the number must be a real number for its country.
    const phones: [string, string][] = [
      ["mobile", payload.mobile || ""],
      ["partner_mobile", payload.partner_mobile || ""],
      ...payload.additional_persons.map((p, i): [string, string] => [
        `additional_persons[${i}].mobile`,
        p.mobile || "",
      ]),
    ];
    for (const [field, value] of phones) {
      if (value !== "" && !(field in errors) && !isValidPhoneNumber(value))
        errors[field] = "invalid_phone";
    }

    if (UNAVAILABLE_PERIODS.includes(values.period))
      errors.period = "unavailable_period";

    for (const [field, code] of Object.entries(errors)) {
      ctx.addIssue({
        code: "custom",
        path: toPath(field),
        message: messageFor(field, code),
      });
    }
  });

export type ApplicationFormValues = z.infer<typeof applicationFormSchema>;

/** The phone input already emits E.164; this also strips stray separators. The result must still be strict E.164. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

/** Form values -> the payload validateApplication() expects. */
export function toApplicationPayload(v: ApplicationFormValues) {
  return {
    period: v.period,
    membership_type: v.membership_type,
    memebership_type: v.membership_type,
    user_type: v.user_type === "" ? null : v.user_type,
    full_name: v.full_name,
    unit_number: v.unit_number,
    mobile: normalizePhone(v.mobile),
    email: v.email,
    nationality: v.nationality,
    partner_name: v.partner_name,
    partner_nationality: v.partner_nationality,
    partner_mobile: normalizePhone(v.partner_mobile),
    partner_email: v.partner_email,
    // An empty list becomes null inside validateApplication (the DB rejects `[]`).
    additional_persons: v.additional_persons.map((p) => ({
      name: p.name,
      relative: p.relative,
      mobile: normalizePhone(p.mobile),
    })),
  };
}

const PERSON_PATH =
  /^additional_persons\[(\d+)\](?:\.(name|relative|mobile))?$/;

function toPath(field: string): (string | number)[] {
  const m = PERSON_PATH.exec(field);
  if (m)
    return m[2]
      ? ["additional_persons", Number(m[1]), m[2]]
      : ["additional_persons", Number(m[1])];
  return field === "_" ? [] : [field];
}

// [min, max] lengths, matching validation.ts.
const LIMITS: Record<string, [number, number]> = {
  full_name: [3, 64],
  partner_name: [3, 64],
  unit_number: [3, 32],
  nationality: [1, 64],
  partner_nationality: [1, 64],
  "person.name": [3, 32],
  "person.relative": [3, 32],
};

function messageFor(field: string, code: string): string {
  switch (code) {
    case "required":
      return "This field is required.";
    case "length": {
      const [min, max] = LIMITS[
        field.replace(/^additional_persons\[\d+\]\./, "person.")
      ] ?? [1, 64];
      return min <= 1
        ? `Use ${max} characters or fewer.`
        : `Use ${min} to ${max} characters.`;
    }
    case "latin_name_only":
      return "Use Latin letters only. Spaces, hyphens and apostrophes are allowed.";
    case "two_latin_name_parts_required":
      return "Enter a first and last name in Latin letters, for example “Sara Ahmed”.";
    case "invalid_phone":
      return "Enter a valid phone number for the selected country.";
    case "unavailable_period":
      return "This membership period is currently unavailable.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "partner_name_required":
      return "Partner’s name is required if other partner details are provided.";
    case "too_many":
      return `You can add up to ${MAX_ADDITIONAL_PERSONS} additional people.`;
    case "too_many_people":
      return `Total headcount cannot exceed ${MAX_TOTAL_HEADCOUNT} people.`;
    case "invalid_value":
      return "Choose one of the available options.";
    default:
      return "Check this value and try again.";
  }
}
