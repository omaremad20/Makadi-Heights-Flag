/** Contract between the public form and POST /api/applications. */

export interface SubmittedPerson {
  id: string;
  name: string;
  relative?: string;
  mobile?: string;
}

/** What the server returns after a successful (or replayed) submission. */
export interface SubmittedApplication {
  id: string;
  created_at: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  persons_count: number;
  partner_name: string | null;
  additional_persons: SubmittedPerson[] | null;
}

export type SubmitApplicationResponse =
  | { ok: true; application: SubmittedApplication }
  | {
      ok: false;
      code:
        | "invalid_request"
        | "validation_failed"
        | "rate_limited"
        | "conflict"
        | "forbidden"
        | "unavailable";
      message: string;
      fieldErrors?: Record<string, string>;
      retryAfterSeconds?: number;
    };
