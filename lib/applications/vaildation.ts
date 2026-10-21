/**
 * Server-side validation + normalization for guest applications.
 * Mirrors the PostgreSQL CHECK constraints (the database remains the final
 * authority) and adds friendlier, field-level errors.
 *
 * PHONE NUMBERS: this phase only checks the E.164 *shape*. True per-country
 * validity needs libphonenumber-js, which is intentionally NOT added yet.
 * Replace `validatePhone` below when the phone input is implemented; keep the
 * contract "returns an E.164 string or null".
 *
 * No third-party dependencies.
 */

export const PERIODS = [
  "week",
  "10-days",
  "month",
  "3months",
  "6months",
  "1year",
] as const;
// 'tenant-vistior' is spelled exactly as in the database enum.
export const USER_TYPES = [
  "owner",
  "tenant-vistior",
  "non-makadi-resident",
] as const;

export const MEMBERSHIP_TYPES = [
  "clubhouse_only",
  "clubhouse_and_beach",
] as const;

/** Mirrors applications_additional_persons_bound_chk in the database. */
export const MAX_ADDITIONAL_PERSONS = 20;
export const MAX_TOTAL_HEADCOUNT = 22;

export type Period = (typeof PERIODS)[number];
export type UserType = (typeof USER_TYPES)[number];
export type MembershipType = (typeof MEMBERSHIP_TYPES)[number];

export interface AdditionalPerson {
  name: string;
  relative: string;
  mobile?: string;
}

export interface ApplicationInput {
  period: Period;
  membership_type: MembershipType;
  user_type: UserType | null;
  full_name: string;
  unit_number: string;
  mobile: string | null; // E.164 (optional)
  email: string | null; // optional
  nationality: string | null; // optional
  partner_name: string | null;
  partner_nationality: string | null;
  partner_mobile: string | null;
  partner_email: string | null;
  additional_persons: AdditionalPerson[] | null;
}

export type ValidationResult =
  | { ok: true; value: ApplicationInput }
  | { ok: false; errors: Record<string, string> };

// Latin letters: ASCII, Latin-1 Supplement, Latin Extended-A/B, Latin Extended
// Additional (precomposed diacritics). Arabic and other scripts are not in the class.
const L = "A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u024F\\u1E00-\\u1EFF";
const NAME_RE = new RegExp(`^[${L}]+([ '’-][${L}]+)*$`);
const PERSON_NAME2_RE = new RegExp(
  `^[${L}]+(['’-][${L}]+)* [${L}]+(['’-][${L}]+)*$`,
);
const E164_SHAPE_RE = /^\+[1-9][0-9]{6,14}$/;
const EMAIL_RE = /^[^@\s\p{Cc}]+@[^@\s\p{Cc}.]+(\.[^@\s\p{Cc}.]+)+$/u;
const CONTROL_RE = /\p{Cc}/u;

const ALLOWED_KEYS = new Set([
  "period",
  "membership_type",
  "memebership_type",
  "user_type",
  "full_name",
  "unit_number",
  "mobile",
  "email",
  "nationality",
  "partner_name",
  "partner_nationality",
  "partner_mobile",
  "partner_email",
  "additional_persons",
]);
const PERSON_KEYS = new Set(["name", "relative", "mobile"]);

class FieldError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** trim; blank -> null. Non-strings are rejected (never coerced). */
function text(v: unknown, collapse = false): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new FieldError("invalid_type");
  const t = collapse ? v.replace(/\s+/g, " ").trim() : v.trim();
  return t === "" ? null : t;
}

function required(v: string | null): string {
  if (v === null) throw new FieldError("required");
  return v;
}

/** Replace with libphonenumber-js (parse + isValid with the selected country) later. */
export function validatePhone(raw: string): string | null {
  return E164_SHAPE_RE.test(raw) ? raw : null;
}

function name(v: string, min: number, max: number): string {
  if (v.length < min || v.length > max) throw new FieldError("length");
  if (!NAME_RE.test(v)) throw new FieldError("latin_name_only");
  return v;
}

function phone(v: string): string {
  const p = validatePhone(v);
  if (p === null) throw new FieldError("invalid_phone");
  return p;
}

function email(v: string): string {
  if (v.length < 5 || v.length > 254 || !EMAIL_RE.test(v))
    throw new FieldError("invalid_email");
  return v;
}

function plain(v: string, min: number, max: number): string {
  if (v.length < min || v.length > max || CONTROL_RE.test(v))
    throw new FieldError("length");
  return v;
}

export function validateApplication(body: unknown): ValidationResult {
  const errors: Record<string, string> = {};
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, errors: { _: "payload_must_be_object" } };
  }
  const src = body as Record<string, unknown>;

  // Strict contract: status, audit fields, ids, timestamps... are rejected, never ignored.
  for (const k of Object.keys(src)) {
    if (!ALLOWED_KEYS.has(k)) errors[k] = "unknown_field";
  }

  const run = <T>(field: string, fn: () => T): T | undefined => {
    try {
      return fn();
    } catch (e) {
      errors[field] = e instanceof FieldError ? e.code : "invalid";
      return undefined;
    }
  };
  const opt = <T>(field: string, fn: (s: string) => T): T | null => {
    const r = run(field, () => {
      const t = text(src[field], field === "partner_name");
      return t === null ? null : fn(t);
    });
    return r === undefined ? null : r;
  };

  const periodRaw = run("period", () => text(src.period) ?? "week");
  if (
    periodRaw !== undefined &&
    !(PERIODS as readonly string[]).includes(periodRaw)
  )
    errors.period = "invalid_value";

  const membershipTypeRaw = run("membership_type", () => {
    const raw = text(src.membership_type ?? src.memebership_type);
    if (!raw) throw new FieldError("required");
    if (!(MEMBERSHIP_TYPES as readonly string[]).includes(raw)) {
      throw new FieldError("invalid_value");
    }
    return raw as MembershipType;
  });

  const userTypeRaw = run("user_type", () => text(src.user_type));
  if (userTypeRaw && !(USER_TYPES as readonly string[]).includes(userTypeRaw))
    errors.user_type = "invalid_value";

  const full_name = run("full_name", () =>
    name(required(text(src.full_name, true)), 3, 64),
  );
  const unit_number = run("unit_number", () =>
    plain(required(text(src.unit_number)), 3, 32),
  );
  const mobile = opt("mobile", phone);
  const emailV = opt("email", email);
  const nationality = opt("nationality", (s) => plain(s, 1, 64));

  const partner_name = opt("partner_name", (s) => name(s, 3, 64));
  const partner_nationality = opt("partner_nationality", (s) =>
    plain(s, 1, 64),
  );
  const partner_mobile = opt("partner_mobile", phone);
  const partner_email = opt("partner_email", email);

  // DB check constraint: applications_partner_requires_name_chk
  if (!partner_name && (partner_nationality || partner_mobile || partner_email)) {
    errors.partner_name = "partner_name_required";
  }

  let additional_persons: AdditionalPerson[] | null = null;
  const ap = src.additional_persons;
  if (ap !== undefined && ap !== null) {
    if (!Array.isArray(ap)) {
      errors.additional_persons = "must_be_array";
    } else if (ap.length > MAX_ADDITIONAL_PERSONS) {
      // Checked before any per-entry work so oversized input is rejected cheaply.
      errors.additional_persons = "too_many";
    } else if (ap.length > 0) {
      const out: AdditionalPerson[] = [];
      ap.forEach((e, i) => {
        const f = `additional_persons[${i}]`;
        if (typeof e !== "object" || e === null || Array.isArray(e)) {
          errors[f] = "must_be_object";
          return;
        }
        const o = e as Record<string, unknown>;
        for (const k of Object.keys(o))
          if (!PERSON_KEYS.has(k)) errors[`${f}.${k}`] = "unknown_field";
        const n = run(`${f}.name`, () => {
          const t = required(text(o.name, true));
          if (t.length < 3 || t.length > 32) throw new FieldError("length");
          if (!PERSON_NAME2_RE.test(t))
            throw new FieldError("two_latin_name_parts_required");
          return t;
        });
        const rel = run(`${f}.relative`, () =>
          plain(required(text(o.relative, true)), 3, 32),
        );
        const mob = run(`${f}.mobile`, () => {
          const t = text(o.mobile);
          return t === null ? null : phone(t);
        });
        if (n !== undefined && rel !== undefined && mob !== undefined) {
          out.push(
            mob === null
              ? { name: n, relative: rel }
              : { name: n, relative: rel, mobile: mob },
          );
        }
      });
      additional_persons = out;
    }
  }

  // Headcount calculation and validation
  const partnerCount = partner_name ? 1 : 0;
  const additionalCount = additional_persons ? additional_persons.length : 0;
  const totalHeadcount = 1 + partnerCount + additionalCount;

  if (totalHeadcount > MAX_TOTAL_HEADCOUNT) {
    errors.additional_persons = "too_many_people";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      period: periodRaw as Period,
      membership_type: membershipTypeRaw!,
      user_type: (userTypeRaw ?? null) as UserType | null,
      full_name: full_name!,
      unit_number: unit_number!,
      mobile: mobile ?? null,
      email: emailV ?? null,
      nationality: nationality ?? null,
      partner_name,
      partner_nationality,
      partner_mobile,
      partner_email,
      additional_persons,
    },
  };
}
