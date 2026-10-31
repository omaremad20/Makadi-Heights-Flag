/** Safe, unique object name for a new menu PDF: starts with a letter, never collides with an existing file. */
export function buildMenuObjectName(originalName: string, now = Date.now()): string {
  const base =
    originalName
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 60) || "menu";
  return `Menu-${base}-${now}.pdf`;
}
