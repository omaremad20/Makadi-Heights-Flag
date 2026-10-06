import { Suspense } from "react";
import { redirect } from "next/navigation";
import { buildProfilesHref, getPagination, parseProfileFilters } from "@/lib/profiles/filters";
import type { ProfileFilters, ProfilesPage } from "@/lib/profiles/types";
import { ProfilesTableSkeleton } from "@/components/dashboard/profiles/profiles-table-skeleton";
import { ProfilesFilters } from "@/components/dashboard/profiles/profiles-filters";
import { ProfilesLoadError } from "@/components/dashboard/profiles/profiles-load-error";
import { ProfilesTable } from "@/components/dashboard/profiles/profiles-table";
import { ProfilesPagination } from "@/components/dashboard/profiles/profiles-pagination";
import { getProfiles } from "@/lib/services/profiles/profiles.service";

export const metadata = { title: "Profiles" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProfilesPage({ searchParams }: PageProps) {
  const filters = parseProfileFilters(await searchParams);

  return (
    <div className="flex flex-col gap-6 ">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Manage employee accounts, approvals and access.
        </p>
      </header>

      <ProfilesFilters filters={filters} />

      {/* New key => new boundary => skeleton shows while the next page/filter loads */}
      <Suspense key={JSON.stringify(filters)} fallback={<ProfilesTableSkeleton />}>
        <ProfilesResults filters={filters} />
      </Suspense>
    </div>
  );
}

async function ProfilesResults({ filters }: { filters: ProfileFilters }) {
  let result: ProfilesPage;
  try {
    result = await getProfiles(filters);
  } catch {
    return <ProfilesLoadError />;
  }

  const pagination = getPagination(filters, result.totalCount);

  // Page beyond the end (e.g. after deactivations or an edited URL): go to the real last page.
  if (result.profiles.length === 0 && result.totalCount > 0) {
    redirect(buildProfilesHref(filters, { page: pagination.totalPages }));
  }

  return (
    <div className="flex flex-col gap-4">
      <ProfilesTable profiles={result.profiles} filters={filters} />
      <ProfilesPagination filters={filters} pagination={pagination} />
    </div>
  );
}