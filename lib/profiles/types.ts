export const PROFILE_ROLES = ["admin", "employee"] as const;
export type ProfileRole = (typeof PROFILE_ROLES)[number];

export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

export type RoleFilter = "all" | ProfileRole;
export type StatusFilter = "all" | "active" | "inactive";
export type ApprovalFilter = "all" | "true" | "false";

export type ProfileFilters = {
  search: string;
  role: RoleFilter;
  status: StatusFilter;
  approved: ApprovalFilter;
  page: number;
  pageSize: number;
};

export type Pagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  from: number; // 1-based index of first row shown (0 when empty)
  to: number;
};

/** Columns used by the list screen only. */
export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  role: ProfileRole;
  is_active: boolean;
  approved: boolean;
  job_title: string | null;
};

/** Columns used by the details screen (includes audit info). */
export type ProfileDetails = Profile & {
  approved_by: string | null;
  approved_by_email_snapshot: string | null;
  created_at: string;
  updated_at: string;
  last_updated_by: string | null;
  last_updated_by_email_snapshot: string | null;
};

export type ProfilesPage = { profiles: Profile[]; totalCount: number };

export type MutationResult =
  | { ok: true }
  | {
      ok: false;
      code: "not_updated" | "forbidden" | "failed";
      message: string;
    };
