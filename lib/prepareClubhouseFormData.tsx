import { Application } from "@/lib/types/applications";

export function prepareClubhouseFormData(app: Application) {
  // 1. Combine additional names using hyphens and ignore phone numbers
  const additionalNamesStr = (app.additional_persons || [])
    .map(
      (person: Record<string, unknown>) =>
        (person.name as string) ||
        (person.fullName as string) ||
        (person.full_name as string) ||
        "",
    )
    .filter(Boolean)
    .join(" - ");

  // 2. Combine additional relations using hyphens
  const additionalRelativesStr = (app.additional_persons || [])
    .map(
      (person: Record<string, unknown>) =>
        (person.relation as string) || (person.relative as string) || "",
    )
    .filter(Boolean)
    .join(" - ");

  return {
    // Membership & User Type Checkboxes
    cb_owner: app.user_type === "owner" ? "☑" : "☐",
    cb_tenant:
      app.user_type === "tenant" ||
      app.user_type === "visitor" ||
      app.user_type === "tenant-vistior"
        ? "☑"
        : "☐",
    cb_non_resident:
      app.user_type === "non_resident" ||
      app.user_type === "non-makadi-resident" ||
      app.user_type === "non-resident"
        ? "☑"
        : "☐",

    cb_annual:
      app.period === "annual" || app.period === "year" || app.period === "1year"
        ? "☑"
        : "☐",
    cb_6months:
      app.period === "6_months" || app.period === "6months" ? "☑" : "☐",
    cb_3months:
      app.period === "3_months" || app.period === "3months" ? "☑" : "☐",
    cb_1month:
      app.period === "1_month" || app.period === "month" ? "☑" : "☐",
    cb_10days:
      app.period === "10_days" ||
      app.period === "10-days" ||
      app.period === "week"
        ? "☑"
        : "☐",

    // Primary Applicant
    FullName: app.full_name || "",
    UnitNumber: app.unit_number || "",
    DateOfBirth: app.date_of_birth
      ? new Date(app.date_of_birth).toLocaleDateString("en-GB")
      : "",
    Nationality: app.nationality || "",
    Mobile: app.mobile || "",
    Email: app.email || "",

    // Partner Details
    PartnerName: app.partner_name || "",
    PartnerNationality: app.partner_nationality || "",
    PartnerMobile: app.partner_mobile || "",
    PartnerEmail: app.partner_email || "",

    // Additional Persons: populate AddName1, AddName2, AddName3 column-by-column (0, 1, 2)
    AddName1:
      (app.additional_persons?.[0]?.name as string) ||
      (app.additional_persons?.[0]?.fullName as string) ||
      additionalNamesStr,
    AddRelative1:
      (app.additional_persons?.[0]?.relative as string) ||
      (app.additional_persons?.[0]?.relation as string) ||
      additionalRelativesStr,
    AddMobile1: (app.additional_persons?.[0]?.mobile as string) || "",

    AddName2:
      (app.additional_persons?.[1]?.name as string) ||
      (app.additional_persons?.[1]?.fullName as string) ||
      "",
    AddRelative2:
      (app.additional_persons?.[1]?.relative as string) ||
      (app.additional_persons?.[1]?.relation as string) ||
      "",
    AddMobile2: (app.additional_persons?.[1]?.mobile as string) || "",

    AddName3:
      (app.additional_persons?.[2]?.name as string) ||
      (app.additional_persons?.[2]?.fullName as string) ||
      "",
    AddRelative3:
      (app.additional_persons?.[2]?.relative as string) ||
      (app.additional_persons?.[2]?.relation as string) ||
      "",
    AddMobile3: (app.additional_persons?.[2]?.mobile as string) || "",

    SubmissionDate: app.created_at
      ? new Date(app.created_at).toLocaleDateString("en-GB")
      : new Date().toLocaleDateString("en-GB"),
  };
}
