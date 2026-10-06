export const LOGIN_PATH = "/login";
// Authenticated but not allowed into the dashboard.
export const DASHBOARD_DENIED_PATH = "/";

export type DashboardAccessProfile =
  | {
      role: string | null;
      is_active: boolean | null;
      approved: boolean | null;
    }
  | null
  | undefined;

/**
 * Single source of truth for dashboard access.
 * Allowed only if: (admin OR employee) AND is_active AND approved.
 */
export function canAccessDashboard(profile: DashboardAccessProfile): boolean {
  if (!profile) return false;
  return (
    (profile.role === "admin" || profile.role === "employee") &&
    profile.is_active === true &&
    profile.approved === true
  );
}