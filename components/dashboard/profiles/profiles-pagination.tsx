import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildProfilesHref } from "@/lib/profiles/filters";
import type { Pagination, ProfileFilters } from "@/lib/profiles/types";

function PageButton({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const className = "size-10 sm:size-9";
  if (!href) {
    return (
      <Button variant="outline" size="icon" className={className} disabled aria-label={label}>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="icon" className={className}>
      <Link href={href} aria-label={label}>
        {children}
      </Link>
    </Button>
  );
}

export function ProfilesPagination({
  filters,
  pagination,
}: {
  filters: ProfileFilters;
  pagination: Pagination;
}) {
  const { page, totalPages, totalCount, from, to } = pagination;
  if (totalCount === 0) return null;

  const href = (target: number) => buildProfilesHref(filters, { page: target });
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col items-center justify-between gap-3 sm:flex-row"
    >
      <p className="text-sm text-muted-foreground">
        Showing {from}–{to} of {totalCount}
      </p>
      <div className="flex items-center gap-1">
        <PageButton href={hasPrev ? href(1) : null} label="First page">
          <ChevronsLeft aria-hidden />
        </PageButton>
        <PageButton href={hasPrev ? href(page - 1) : null} label="Previous page">
          <ChevronLeft aria-hidden />
        </PageButton>
        <span className="px-3 text-sm" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <PageButton href={hasNext ? href(page + 1) : null} label="Next page">
          <ChevronRight aria-hidden />
        </PageButton>
        <PageButton href={hasNext ? href(totalPages) : null} label="Last page">
          <ChevronsRight aria-hidden />
        </PageButton>
      </div>
    </nav>
  );
}