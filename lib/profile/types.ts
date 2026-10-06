export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: string; // public.user_role enum, e.g. "admin" | "employee" | "customer"
  is_active: boolean;
  approved: boolean;
  approved_by: string | null;
  approved_by_email_snapshot: string | null;
  job_title: string | null;
  created_at: string;
  updated_at: string;
  last_updated_by: string | null;
  last_updated_by_email_snapshot: string | null;
};

export type CurrentProfileResult =
  | { status: "ok"; profile: Profile; providerAvatarUrl: string | null }
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | { status: "error" };