import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ApplicationsFilters } from "@/components/dashboard/applications/applications-filters";
import { ApplicationsPagination } from "@/components/dashboard/applications/applications-pagination";
import {
  ApplicationsEmpty,
  ApplicationsLoadError,
  ApplicationsTableSkeleton,
} from "@/components/dashboard/applications/applications-states";
import { ApplicationsTable } from "@/components/dashboard/applications/applications-table";
import { getAdminContext, type AdminContext } from "@/lib/auth/require-admin";
import {
  APPLICATION_STATUSES,
  buildApplicationsHref,
  getPagination,
  hasActiveFilters,
  parseApplicationListParams,
  type ApplicationListParams,
} from "@/lib/applications/list-params";
import { getApplicationStats, listApplications } from "@/lib/services/applications/applications.service";
import { cn } from "@/lib/utils";

export const metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ApplicationsPage({ searchParams }: PageProps) {
  // Admins only. The proxy already redirects employees; this is the server-side guarantee.
  const ctx = await getAdminContext();
  if (!ctx) redirect("/dashboard/sea");

  const params = parseApplicationListParams(await searchParams);

  const { data: profile } = await ctx.supabase.from("profiles").select("full_name").eq("id", ctx.userId).maybeSingle();
  const adminName = profile?.full_name?.trim() || ctx.email || "Community Office";

  return (
    <div className="flex flex-col gap-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
        <p className="text-sm text-muted-foreground">Review, correct and approve clubhouse membership applications.</p>
      </header>

      <Suspense fallback={<div className="h-[76px] rounded-lg border bg-muted/40" />}>
        <Stats ctx={ctx} params={params} />
      </Suspense>

      <ApplicationsFilters params={params} />

      <Suspense key={JSON.stringify(params)} fallback={<ApplicationsTableSkeleton />}>
        <Results ctx={ctx} params={params} adminName={adminName} />
      </Suspense>
    </div>
  );
}

async function Stats({ ctx, params }: { ctx: AdminContext; params: ApplicationListParams }) {
  let stats: Awaited<ReturnType<typeof getApplicationStats>>;
  try {
    stats = await getApplicationStats(ctx);
  } catch {
    return null;
  }
  const items = [
    { key: "all", label: "All", value: stats.total },
    ...APPLICATION_STATUSES.map((s) => ({ key: s, label: s[0].toUpperCase() + s.slice(1), value: stats[s] })),
  ];
  return (
    <nav aria-label="Filter by status" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((i) => (
        <Link
          key={i.key}
          href={buildApplicationsHref(params, { status: i.key as ApplicationListParams["status"] })}
          aria-current={params.status === i.key ? "true" : undefined}
          className={cn(
            "rounded-lg border bg-card p-3 transition-colors hover:border-primary/60",
            params.status === i.key && "border-primary ring-1 ring-primary",
          )}
        >
          <p className="text-xs text-muted-foreground">{i.label}</p>
          <p className="text-2xl font-semibold tabular-nums">{i.value}</p>
        </Link>
      ))}
    </nav>
  );
}

async function Results({ ctx, params, adminName }: { ctx: AdminContext; params: ApplicationListParams; adminName: string }) {
  let result: Awaited<ReturnType<typeof listApplications>>;
  try {
    result = await listApplications(ctx, params);
  } catch (e) {
    console.error("[applications] list failed", e instanceof Error ? e.message : e);
    return <ApplicationsLoadError />;
  }

  const pagination = getPagination(params, result.totalCount);
  if (result.rows.length === 0 && result.totalCount > 0) {
    redirect(buildApplicationsHref(params, { page: pagination.totalPages }));
  }
  if (result.rows.length === 0) return <ApplicationsEmpty filtered={hasActiveFilters(params)} />;

  return (
    <div className="flex flex-col gap-4">
      <ApplicationsTable rows={result.rows} adminName={adminName} />
      <ApplicationsPagination params={params} totalCount={result.totalCount} />
    </div>
  );
}
