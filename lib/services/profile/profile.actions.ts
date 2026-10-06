"use server";

import { updateMyPhone } from "@/lib/services/profile/profile.service";

export async function updateMyPhoneAction(phone: string) {
  await updateMyPhone(phone);
}