import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  canAccessDashboard,
  DASHBOARD_DENIED_PATH,
} from "@/app/dashboard/access";
import { resolveAccessGate } from "./lib/services/auth/access-gate";

type AccessStatusRow = {
  is_active: boolean | null;
  approved: boolean | null;
};

/**
 * Admin-only dashboard areas (prefix match, so nested routes such as
 * /dashboard/applications/export are covered). Pages, server actions and route
 * handlers also check is_active_approved_admin() themselves, and RLS enforces
 * it in the database; this redirect is only the first layer.
 */
const ADMIN_ONLY_PREFIXES = [
  "/dashboard/profiles",
  "/dashboard/applications",
  "/dashboard/menu",
];

function isAdminOnlyPath(pathname: string) {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const EMPLOYEE_REDIRECT_PATH = "/dashboard/sea";
const DASHBOARD_DEFAULT_PATH = "/dashboard/sea";

// Strip trailing slashes so "/dashboard/" and "/dashboard/profiles/" match exactly.
function normalizePath(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

// "/dashboardx" is NOT a dashboard route.
function isDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/");
}

function redirectWithCookies(
  request: NextRequest,
  pathname: string,
  from: NextResponse,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const redirect = NextResponse.redirect(url);

  // Preserve any refreshed session cookies.
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));

  return redirect;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  /*
   * Access status (is_active / approved).
   *
   * Read through the SECURITY DEFINER rpc, NOT from `profiles`:
   * profiles RLS intentionally hides the row from unapproved/inactive users.
   * RPC errors and missing rows leave `status` null -> fail closed (treated as inactive).
   */
  const { data: status } = user
    ? await supabase
        .rpc("get_my_access_status")
        .maybeSingle<AccessStatusRow>()
    : { data: null };

  const pathname = normalizePath(request.nextUrl.pathname);

  /*
   * Access gate: runs BEFORE any dashboard/profile authorization.
   * Handles /login, unauthenticated, inactive and unapproved users (any role).
   * Active + approved users fall through to the existing dashboard logic below.
   */
  const gate = resolveAccessGate(
    pathname,
    user
      ? {
          authenticated: true,
          is_active: status?.is_active ?? null,
          approved: status?.approved ?? null,
        }
      : { authenticated: false },
  );

  if (gate.action === "redirect") {
    return redirectWithCookies(request, gate.to, response);
  }

  if (gate.action === "allow") {
    return response;
  }

  /*
   * Dashboard protection (active + approved users only reach this point).
   */
  if (isDashboardPath(pathname)) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, is_active, approved")
      .eq("id", user!.id)
      .maybeSingle();

    /*
     * Missing profile / database error / inactive user:
     * dashboard is completely unavailable.
     */
    if (error || !profile || profile.is_active !== true) {
      return redirectWithCookies(
        request,
        DASHBOARD_DENIED_PATH,
        response,
      );
    }

    /*
     * Active + approved users must pass normal dashboard access rules.
     */
    if (!canAccessDashboard(profile)) {
      return redirectWithCookies(
        request,
        DASHBOARD_DENIED_PATH,
        response,
      );
    }

    // /dashboard is only an entry point.
    if (pathname === "/dashboard") {
      return redirectWithCookies(
        request,
        DASHBOARD_DEFAULT_PATH,
        response,
      );
    }

    // Employees cannot access restricted dashboard pages.
    if (profile?.role !== "admin" && isAdminOnlyPath(pathname)) {
      return redirectWithCookies(
        request,
        EMPLOYEE_REDIRECT_PATH,
        response,
      );
    }
  }

  return response;
}

export const config = {
  matcher: ["/login", "/dashboard/:path*"],
};