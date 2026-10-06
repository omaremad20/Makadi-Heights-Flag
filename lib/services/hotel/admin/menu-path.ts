/**
 * Extracts the Storage object path from a Supabase public (or signed) URL.
 * Returns null — never throws — if the URL is not a URL for `bucket` on OUR project,
 * so we can never delete something we don't own.
 */
export function extractMenuObjectPath(
  menuLink: string | null | undefined,
  supabaseUrl: string,
  bucket: string,
): string | null {
  if (!menuLink) return null;
  try {
    const url = new URL(menuLink);
    if (url.origin !== new URL(supabaseUrl).origin) return null;

    const prefix = [`/storage/v1/object/public/${bucket}/`, `/storage/v1/object/sign/${bucket}/`].find(
      (p) => url.pathname.startsWith(p),
    );
    if (!prefix) return null;

    const path = decodeURIComponent(url.pathname.slice(prefix.length)); // handles %20 etc.
    if (!path || path.split("/").some((seg) => seg === "" || seg === "." || seg === "..")) return null;
    return path;
  } catch {
    return null;
  }
}