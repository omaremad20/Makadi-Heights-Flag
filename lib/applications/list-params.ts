/**
 * URL <-> filter state for the applications dashboard. Pure (no Next/Supabase)
 * so it is unit tested. Every value from the URL is validated.
 */

export const APPLICATION_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export const LIST_MEMBERSHIP_TYPES = ["clubhouse_only", "clubhouse_and_beach"] as const;
export const LIST_USER_TYPES = ["owner", "tenant-vistior", "non-makadi-resident"] as const;
export const LIST_PERIODS = ["week", "10-days", "month", "3months", "6months", "1year"] as const;
export const SORT_FIELDS = ["created_at", "full_name", "unit_number", "status", "persons_count"] as const;
export const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_SEARCH_LENGTH = 64;

export type ApplicationStatusValue = (typeof APPLICATION_STATUSES)[number];
export type SortField = (typeof SORT_FIELDS)[number];

export interface ApplicationListParams {
  search: string;
  status: "all" | ApplicationStatusValue;
  membershipType: "all" | (typeof LIST_MEMBERSHIP_TYPES)[number];
  userType: "all" | (typeof LIST_USER_TYPES)[number];
  period: "all" | (typeof LIST_PERIODS)[number];
  /** YYYY-MM-DD, inclusive, Cairo calendar days */
  from: string;
  to: string;
  sort: SortField;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
}

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function pick<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return allowed.find((o) => o === value) ?? fallback;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(v: string | undefined): string {
  if (!v || !DATE_RE.test(v)) return "";
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? "" : v;
}

export const DEFAULT_PARAMS: ApplicationListParams = {
  search: "",
  status: "all",
  membershipType: "all",
  userType: "all",
  period: "all",
  from: "",
  to: "",
  sort: "created_at",
  dir: "desc",
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
};

export function parseApplicationListParams(raw: Raw): ApplicationListParams {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  const pageSize = Number.parseInt(first(raw.pageSize) ?? "", 10);
  let from = validDate(first(raw.from));
  let to = validDate(first(raw.to));
  if (from && to && from > to) [from, to] = [to, from];

  return {
    search: (first(raw.search) ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SEARCH_LENGTH),
    status: pick(first(raw.status), ["all", ...APPLICATION_STATUSES] as const, "all"),
    membershipType: pick(first(raw.membership), ["all", ...LIST_MEMBERSHIP_TYPES] as const, "all"),
    userType: pick(first(raw.userType), ["all", ...LIST_USER_TYPES] as const, "all"),
    period: pick(first(raw.period), ["all", ...LIST_PERIODS] as const, "all"),
    from,
    to,
    sort: pick(first(raw.sort), SORT_FIELDS, "created_at"),
    dir: pick(first(raw.dir), ["asc", "desc"] as const, "desc"),
    page: Number.isSafeInteger(page) && page > 0 && page < 100_000 ? page : 1,
    pageSize: PAGE_SIZE_OPTIONS.find((o) => o === pageSize) ?? DEFAULT_PAGE_SIZE,
  };
}

export function toSearchParams(p: ApplicationListParams): URLSearchParams {
  const q = new URLSearchParams();
  if (p.search) q.set("search", p.search);
  if (p.status !== "all") q.set("status", p.status);
  if (p.membershipType !== "all") q.set("membership", p.membershipType);
  if (p.userType !== "all") q.set("userType", p.userType);
  if (p.period !== "all") q.set("period", p.period);
  if (p.from) q.set("from", p.from);
  if (p.to) q.set("to", p.to);
  if (p.sort !== "created_at") q.set("sort", p.sort);
  if (p.dir !== "desc") q.set("dir", p.dir);
  if (p.page > 1) q.set("page", String(p.page));
  if (p.pageSize !== DEFAULT_PAGE_SIZE) q.set("pageSize", String(p.pageSize));
  return q;
}

export function buildApplicationsHref(p: ApplicationListParams, overrides: Partial<ApplicationListParams> = {}): string {
  const next = { ...p, ...overrides };
  // any filter change goes back to page 1 unless a page is given explicitly
  if (!("page" in overrides) && Object.keys(overrides).length > 0) next.page = 1;
  const query = toSearchParams(next).toString();
  return query ? `/dashboard/applications?${query}` : "/dashboard/applications";
}

export function hasActiveFilters(p: ApplicationListParams): boolean {
  return (
    p.search !== "" ||
    p.status !== "all" ||
    p.membershipType !== "all" ||
    p.userType !== "all" ||
    p.period !== "all" ||
    p.from !== "" ||
    p.to !== ""
  );
}

export function getPagination(p: ApplicationListParams, totalCount: number) {
  const totalPages = Math.max(1, Math.ceil(totalCount / p.pageSize));
  return {
    page: p.page,
    pageSize: p.pageSize,
    totalCount,
    totalPages,
    from: totalCount === 0 ? 0 : (p.page - 1) * p.pageSize + 1,
    to: Math.min(p.page * p.pageSize, totalCount),
  };
}

/**
 * Cairo calendar day -> UTC instant bounds for created_at filtering.
 * Cairo is UTC+2 or UTC+3 (DST); computed with Intl so DST is respected.
 */
export function cairoDayStartUtc(day: string): string {
  const guess = new Date(`${day}T00:00:00Z`);
  const offsetMinutes = cairoOffsetMinutes(guess);
  return new Date(guess.getTime() - offsetMinutes * 60_000).toISOString();
}

function cairoOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Africa/Cairo",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((x) => x.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((local - at.getTime()) / 60_000);
}

export function nextDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
