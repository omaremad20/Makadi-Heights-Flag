import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  type Pagination,
  type ProfileFilters,
} from "./types";

type RawSearchParams = Record<string, string | string[] | undefined>;

const MAX_SEARCH_LENGTH = 100;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pick<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.find((option) => option === value) ?? fallback;
}

/** Never trust the URL: every value is validated and falls back to a default. */
export function parseProfileFilters(raw: RawSearchParams): ProfileFilters {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  const pageSize = Number.parseInt(first(raw.pageSize) ?? "", 10);

  return {
    search: (first(raw.search) ?? "").trim().slice(0, MAX_SEARCH_LENGTH),
    role: pick(first(raw.role), ["all", "admin", "employee"] as const, "all"),
    status: pick(
      first(raw.status),
      ["all", "active", "inactive"] as const,
      "all",
    ),
    approved: pick(
      first(raw.approved),
      ["all", "true", "false"] as const,
      "all",
    ),
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize:
      PAGE_SIZE_OPTIONS.find((o) => o === pageSize) ?? DEFAULT_PAGE_SIZE,
  };
}

export function buildProfilesHref(
  filters: ProfileFilters,
  overrides: Partial<ProfileFilters> = {},
): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.search) params.set("search", next.search);
  if (next.role !== "all") params.set("role", next.role);
  if (next.status !== "all") params.set("status", next.status);
  if (next.approved !== "all") params.set("approved", next.approved);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== DEFAULT_PAGE_SIZE)
    params.set("pageSize", String(next.pageSize));
  const query = params.toString();
  return query ? `/dashboard/profiles?${query}` : "/dashboard/profiles";
}

export function hasActiveFilters(filters: ProfileFilters): boolean {
  return (
    filters.search !== "" ||
    filters.role !== "all" ||
    filters.status !== "all" ||
    filters.approved !== "all"
  );
}

export function getPagination(
  filters: ProfileFilters,
  totalCount: number,
): Pagination {
  const { page, pageSize } = filters;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    page,
    pageSize,
    totalCount,
    totalPages,
    from: totalCount === 0 ? 0 : (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, totalCount),
  };
}
