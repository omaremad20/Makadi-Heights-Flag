export type ApplicationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";
export type ApplicationPeriod = "week" | "month" | "year" | string; // Extended based on application_period enum
export type ApplicationUserType = string; // Inferred from application_user_type

export interface AdditionalPerson {
  name?: string;
  age?: number;
  relation?: string;
  [key: string]: unknown; // Flexible for JSONB
}

export interface Application {
  id: string;
  created_at: string;
  updated_at: string;
  period: ApplicationPeriod;
  full_name: string;
  unit_number: string;
  date_of_birth: string;
  mobile: string;
  email: string;
  nationality: string;
  partner_name: string | null;
  partner_nationality: string | null;
  partner_mobile: string | null;
  partner_email: string | null;
  additional_persons: AdditionalPerson[] | null;
  status: ApplicationStatus;
  user_type: ApplicationUserType | null;
  membership_type: string | null;

  // Audit & System fields
  idempotency_key: string | null;
  created_by: string | null;
  last_updated_by: string | null;
  status_updated_by: string | null;
  created_by_email_snapshot: string | null;
  last_updated_by_email_snapshot: string | null;
  status_updated_by_email_snapshot: string | null;
}
