"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { buildProfilesHref, hasActiveFilters } from "@/lib/profiles/filters";
import {
  PAGE_SIZE_OPTIONS,
  type ApprovalFilter,
  type ProfileFilters,
  type RoleFilter,
  type StatusFilter,
} from "@/lib/profiles/types";

type Option = { value: string; label: string };

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Option[];
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label} className="w-full sm:w-[150px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const ROLE_OPTIONS: Option[] = [
  { value: "all", label: "All roles" },
  { value: "employee", label: "Employee" },
  { value: "admin", label: "Admin" },
];
const STATUS_OPTIONS: Option[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];
const APPROVAL_OPTIONS: Option[] = [
  { value: "all", label: "All approvals" },
  { value: "true", label: "Approved" },
  { value: "false", label: "Not approved" },
];
const PAGE_SIZE_SELECT: Option[] = PAGE_SIZE_OPTIONS.map((n) => ({
  value: String(n),
  label: `${n} / page`,
}));

export function ProfilesFilters({ filters }: { filters: ProfileFilters }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- debounced search input, kept in sync with the URL (back/forward) ---
  const [term, setTerm] = useState(filters.search);
  const [seenUrlSearch, setSeenUrlSearch] = useState(filters.search);
  const [lastPushed, setLastPushed] = useState(filters.search);

  if (filters.search !== seenUrlSearch) {
    setSeenUrlSearch(filters.search);
    // Only overwrite typing when the URL changed from somewhere other than this input.
    if (filters.search !== lastPushed) {
      setTerm(filters.search);
      setLastPushed(filters.search);
    }
  }

  useEffect(() => {
    const next = term.trim();
    if (next === filters.search) return;
    const timer = setTimeout(() => {
      setLastPushed(next);
      startTransition(() => {
        router.replace(buildProfilesHref(filters, { search: next, page: 1 }), { scroll: false });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [term, filters, router]);

  function navigate(overrides: Partial<ProfileFilters>) {
    // Any filter change resets to page 1.
    startTransition(() => {
      router.push(buildProfilesHref(filters, { ...overrides, page: 1 }), { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Search name, email, phone or job title…"
          aria-label="Search users"
          className="pl-9 pr-9 text-base"
        />
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          {isPending ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : term ? (
            <button
              type="button"
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>
        <span role="status" className="sr-only">
          {isPending ? "Loading users" : ""}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        <FilterSelect
          label="Filter by role"
          value={filters.role}
          options={ROLE_OPTIONS}
          onChange={(v) => navigate({ role: v as RoleFilter })}
        />
        <FilterSelect
          label="Filter by status"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(v) => navigate({ status: v as StatusFilter })}
        />
        <FilterSelect
          label="Filter by approval"
          value={filters.approved}
          options={APPROVAL_OPTIONS}
          onChange={(v) => navigate({ approved: v as ApprovalFilter })}
        />
        <FilterSelect
          label="Rows per page"
          value={String(filters.pageSize)}
          options={PAGE_SIZE_SELECT}
          onChange={(v) => navigate({ pageSize: Number(v) })}
        />
        {hasActiveFilters(filters) && (
          <Button
            variant="ghost"
            className="col-span-2 sm:col-span-1"
            onClick={() => {
              setTerm("");
              setLastPushed("");
              startTransition(() => router.push("/dashboard/profiles", { scroll: false }));
            }}
          >
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}