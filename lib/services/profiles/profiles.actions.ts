"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/profiles/utils";
import type { MutationResult } from "@/lib/profiles/types";
import { deactivateEmployee, promoteEmployeeToAdmin, setEmployeeApproval } from "./profiles.service";

const INVALID: MutationResult = { ok: false, code: "failed", message: "Invalid request." };

function refresh(userId: string) {
  revalidatePath("/dashboard/profiles");
  revalidatePath(`/dashboard/profiles/${userId}`);
}

// Sets an explicit target value (not a toggle), so double-submits and stale UI are idempotent.
export async function setEmployeeApprovalAction(
  userId: string,
  approved: boolean,
): Promise<MutationResult> {
  if (!isUuid(userId) || typeof approved !== "boolean") return INVALID;
  const result = await setEmployeeApproval(userId, approved);
  refresh(userId); // also on failure, so the UI re-syncs with the real state
  return result;
}

export async function deactivateEmployeeAction(userId: string): Promise<MutationResult> {
  if (!isUuid(userId)) return INVALID;
  const result = await deactivateEmployee(userId);
  refresh(userId);
  return result;
}

export async function promoteEmployeeToAdminAction(userId: string): Promise<MutationResult> {
  if (!isUuid(userId)) return INVALID;
  const result = await promoteEmployeeToAdmin(userId);
  refresh(userId);
  return result;
}