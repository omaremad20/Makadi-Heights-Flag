"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, LoaderCircle, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MEMBERSHIP_TYPE_LABELS, PERIOD_LABELS, USER_TYPE_LABELS } from "@/lib/applications/form-schema";
import {
  APPLICATION_STATUSES,
  buildApplicationsHref,
  hasActiveFilters,
  LIST_MEMBERSHIP_TYPES,
  LIST_PERIODS,
  LIST_USER_TYPES,
  MAX_SEARCH_LENGTH,
  PAGE_SIZE_OPTIONS,
  toSearchParams,
  type ApplicationListParams,
  type SortField,
} from "@/lib/applications/list-params";

type Option = { value: string; label: string };

function FilterSelect({
  label,
  value,
  options,
  onChange,
  className = "w-full sm:w-[170px]",
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const SORTS: Array<{ value: string; label: string; sort: SortField; dir: "asc" | "desc" }> = [
  { value: "created_at:desc", label: "Newest first", sort: "created_at", dir: "desc" },
  { value: "created_at:asc", label: "Oldest first", sort: "created_at", dir: "asc" },
  { value: "full_name:asc", label: "Name A–Z", sort: "full_name", dir: "asc" },
  { value: "unit_number:asc", label: "Unit", sort: "unit_number", dir: "asc" },
  { value: "status:asc", label: "Status", sort: "status", dir: "asc" },
  { value: "persons_count:desc", label: "Most people", sort: "persons_count", dir: "desc" },
];

/** All filtering happens on the server; this only edits the URL. */
export function ApplicationsFilters({ params }: { params: ApplicationListParams }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(params.search);
  const [prevSearch, setPrevSearch] = useState(params.search);
  if (prevSearch !== params.search) {
    setPrevSearch(params.search);
    setSearch(params.search);
  }

  const go = (overrides: Partial<ApplicationListParams>) =>
    startTransition(() => router.push(buildApplicationsHref(params, overrides)));

  const sortValue = `${params.sort}:${params.dir}`;
  const exportQuery = toSearchParams({ ...params, page: 1 }).toString();

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3 sm:p-4">
      <form
        role="search"
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          go({ search: search.trim() });
        }}
      >
        <div className="relative flex-1">
          <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            maxLength={MAX_SEARCH_LENGTH}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, partner, unit, email, mobile or application ID"
            aria-label="Search applications"
            className="pl-9"
          />
        </div>
        <Button type="submit" disabled={isPending}>
          {isPending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Search aria-hidden />}
          Search
        </Button>
      </form>

      <div className="flex flex-col flex-wrap gap-2 sm:flex-row sm:items-center">
        <FilterSelect
          label="Status"
          value={params.status}
          onChange={(v) => go({ status: v as ApplicationListParams["status"] })}
          options={[{ value: "all", label: "All statuses" }, ...APPLICATION_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))]}
        />
        <FilterSelect
          label="Membership"
          value={params.membershipType}
          onChange={(v) => go({ membershipType: v as ApplicationListParams["membershipType"] })}
          options={[{ value: "all", label: "All memberships" }, ...LIST_MEMBERSHIP_TYPES.map((m) => ({ value: m, label: MEMBERSHIP_TYPE_LABELS[m] }))]}
        />
        <FilterSelect
          label="Applicant type"
          value={params.userType}
          onChange={(v) => go({ userType: v as ApplicationListParams["userType"] })}
          options={[{ value: "all", label: "All applicant types" }, ...LIST_USER_TYPES.map((u) => ({ value: u, label: USER_TYPE_LABELS[u] }))]}
        />
        <FilterSelect
          label="Period"
          value={params.period}
          onChange={(v) => go({ period: v as ApplicationListParams["period"] })}
          options={[{ value: "all", label: "All periods" }, ...LIST_PERIODS.map((p) => ({ value: p, label: PERIOD_LABELS[p] }))]}
        />
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="apps-from">Submitted from</label>
          <Input id="apps-from" type="date" value={params.from} max={params.to || undefined} className="w-full sm:w-[150px]"
            onChange={(e) => go({ from: e.target.value })} />
          <span aria-hidden className="text-muted-foreground">–</span>
          <label className="sr-only" htmlFor="apps-to">Submitted to</label>
          <Input id="apps-to" type="date" value={params.to} min={params.from || undefined} className="w-full sm:w-[150px]"
            onChange={(e) => go({ to: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row">
          <FilterSelect
            label="Sort"
            value={sortValue}
            onChange={(v) => {
              const s = SORTS.find((o) => o.value === v);
              if (s) go({ sort: s.sort, dir: s.dir });
            }}
            options={SORTS.find((o) => o.value === sortValue) ? SORTS : [...SORTS, { value: sortValue, label: "Custom", sort: params.sort, dir: params.dir }]}
          />
          <FilterSelect
            label="Rows per page"
            value={String(params.pageSize)}
            onChange={(v) => go({ pageSize: Number(v) })}
            options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: `${n} per page` }))}
            className="w-full sm:w-[140px]"
          />
        </div>
        <div className="flex gap-2">
          {hasActiveFilters(params) && (
            <Button type="button" variant="ghost" disabled={isPending} onClick={() => { setSearch(""); startTransition(() => router.push("/dashboard/applications")); }}>
              <X aria-hidden />
              Clear filters
            </Button>
          )}
          <Button asChild variant="outline">
            <a href={`/dashboard/applications/export${exportQuery ? `?${exportQuery}` : ""}`} download>
              <Download aria-hidden />
              Export CSV
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
