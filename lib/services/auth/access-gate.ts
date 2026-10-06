/**
 * Approval/active gate for the dashboard proxy.
 * Pure function: no Supabase, no Next imports -> trivially testable.
 *
 * It ONLY decides the active / approved gate.
 * For active + approved users it returns { action: "continue" } so the
 * EXISTING dashboard logic (/dashboard -> /dashboard/sea, employee-restricted
 * routes, canAccessDashboard()) keeps running unchanged.
 */

export const LOGIN_PATH = "/login";
export const HOME_PATH = "/";
export const WAITING_PATH = "/dashboard/waiting-for-approve";
export const DEFAULT_DASHBOARD_PATH = "/dashboard/sea";

export type AccessStatus =
  | { authenticated: false }
  | {
      authenticated: true;
      /** from get_my_access_status(); null/undefined when unknown (RPC error / no profile row) */
      is_active: boolean | null | undefined;
      approved: boolean | null | undefined;
    };

export type GateResult =
  | { action: "redirect"; to: string }
  | { action: "allow" } // final decision: serve the request as-is
  | { action: "continue" }; // approved + active: run existing dashboard authorization

function normalize(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function isDashboard(path: string): boolean {
  return path === "/dashboard" || path.startsWith("/dashboard/");
}

export function resolveAccessGate(
  rawPathname: string,
  status: AccessStatus,
): GateResult {
  const path = normalize(rawPathname);

  // Unauthenticated
  if (!status.authenticated) {
    return isDashboard(path)
      ? { action: "redirect", to: LOGIN_PATH }
      : { action: "allow" };
  }

  // Authenticated + inactive (fail closed: unknown status is treated as inactive)
  if (status.is_active !== true) {
    return path === LOGIN_PATH || isDashboard(path)
      ? { action: "redirect", to: HOME_PATH }
      : { action: "allow" };
  }

  // Authenticated + active + NOT approved (any role)
  if (status.approved !== true) {
    if (path === LOGIN_PATH) return { action: "redirect", to: WAITING_PATH };
    if (path === WAITING_PATH) return { action: "allow" };
    if (isDashboard(path)) return { action: "redirect", to: WAITING_PATH };
    return { action: "allow" }; // "/" and public pages stay reachable
  }

  // Authenticated + active + approved
  if (path === LOGIN_PATH || path === WAITING_PATH) {
    return { action: "redirect", to: DEFAULT_DASHBOARD_PATH };
  }
  return { action: "continue" };
}
