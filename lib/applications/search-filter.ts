/**
 * Builds the PostgREST `or` filter for the dashboard search box.
 *
 * The previous implementation interpolated raw input into
 * `full_name.ilike.%${search}%,…`; a comma or parenthesis in the input changed
 * the filter's structure. Here every value is:
 *   1. LIKE-escaped (\ % _ become literals),
 *   2. wrapped in PostgREST double quotes with " and \ escaped,
 * so the input can only ever be a literal search term.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const SEARCH_COLUMNS = ["full_name", "partner_name", "unit_number", "email", "mobile"] as const;

/** Escapes LIKE metacharacters so they match literally. */
export function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Quotes a value for use inside a PostgREST logic filter. */
export function quotePostgrestValue(value: string): string {
  return `"${value.replace(/["\\]/g, (c) => `\\${c}`)}"`;
}

/**
 * Returns the `or()` expression, or null when there is nothing to search.
 * A full application id matches by id exactly.
 */
export function buildSearchFilter(raw: string): string | null {
  // strip control characters; collapse whitespace
  const term = raw.replace(/\p{Cc}/gu, "").replace(/\s+/g, " ").trim().slice(0, 64);
  if (!term) return null;

  if (UUID_RE.test(term)) return `id.eq.${term.toLowerCase()}`;

  const pattern = quotePostgrestValue(`%${escapeLike(term)}%`);
  const filters = SEARCH_COLUMNS.map((c) => `${c}.ilike.${pattern}`);

  // Phone numbers are stored as E.164 (+2010…); also match what people type ("010 …").
  const digits = term.replace(/[^\d]/g, "").replace(/^0+/, "");
  if (digits.length >= 4 && digits !== term) {
    const phonePattern = quotePostgrestValue(`%${digits}%`);
    filters.push(`mobile.ilike.${phonePattern}`, `partner_mobile.ilike.${phonePattern}`);
  }
  return filters.join(",");
}
