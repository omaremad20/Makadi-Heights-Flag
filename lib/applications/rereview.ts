/**
 * Mirrors public.app_requires_rereview() (migration 20261031200200) so the edit
 * form can WARN before saving. The database trigger is the only authority:
 * this function never decides the stored status.
 */

export interface RereviewSnapshot {
  status: string;
  period: string;
  membership_type: string | null;
  user_type: string | null;
  unit_number: string;
  partner_name: string | null;
  additional_person_ids: Array<string | null>;
}

export function wouldRequireRereview(before: RereviewSnapshot, after: RereviewSnapshot): boolean {
  if (before.status !== "approved") return false;
  const ids = (list: Array<string | null>) =>
    list
      .map((x) => x ?? "new")
      .sort()
      .join("|");
  const headcount = (s: RereviewSnapshot) => 1 + (s.partner_name ? 1 : 0) + s.additional_person_ids.length;

  return (
    before.period !== after.period ||
    (before.membership_type ?? null) !== (after.membership_type ?? null) ||
    (before.user_type ?? null) !== (after.user_type ?? null) ||
    before.unit_number !== after.unit_number ||
    headcount(before) !== headcount(after) ||
    Boolean(before.partner_name) !== Boolean(after.partner_name) ||
    ids(before.additional_person_ids) !== ids(after.additional_person_ids)
  );
}
