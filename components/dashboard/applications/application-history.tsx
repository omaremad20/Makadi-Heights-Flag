import { History, RotateCcw } from "lucide-react";

import { FIELD_LABELS, formatDateTime } from "@/lib/applications/labels";
import type { RevisionRow } from "@/lib/applications/types";

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) {
    return (
      value
        .map((p) => (p && typeof p === "object" && "name" in p ? String((p as { name: unknown }).name) : JSON.stringify(p)))
        .join(", ") || "—"
    );
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function label(field: string): string {
  if (field.startsWith("photo:")) return "Photo replaced";
  return FIELD_LABELS[field] ?? field;
}

/** Read-only audit trail (append-only table; admins can read, nobody can change it). */
export function ApplicationHistory({ revisions }: { revisions: RevisionRow[] }) {
  if (revisions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground">
        <History className="size-6" aria-hidden />
        No changes have been made since submission.
      </div>
    );
  }

  return (
    <ol className="space-y-3 text-sm">
      {revisions.map((r) => (
        <li key={r.id} className="rounded-lg border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{formatDateTime(r.changed_at)}</span>
            <span>{r.changed_by_email_snapshot ?? "System"}</span>
          </div>
          {r.status_reset_for_review && (
            <p className="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">
              <RotateCcw className="size-3.5" aria-hidden />
              Approval reset to pending for re-review
            </p>
          )}
          <dl className="mt-2 space-y-1.5">
            {r.changed_fields
              .filter((f) => f !== "persons_count" || r.changed_fields.length === 1)
              .map((f) => (
                <div key={f} className="grid gap-0.5 sm:grid-cols-[140px_1fr]">
                  <dt className="font-medium">{label(f)}</dt>
                  <dd className="min-w-0 break-words">
                    {f.startsWith("photo:") ? (
                      <span className="text-muted-foreground">{r.old_values[f] ? "Previous photo kept for 30 days" : "First photo added"}</span>
                    ) : (
                      <>
                        <span className="text-muted-foreground line-through">{show(r.old_values[f])}</span>{" "}
                        <span aria-hidden>→</span> <span>{show(r.new_values[f])}</span>
                      </>
                    )}
                  </dd>
                </div>
              ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}
