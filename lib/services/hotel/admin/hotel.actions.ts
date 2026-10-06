"use server";

import { revalidatePath } from "next/cache";
import { ActionResult } from "./schema";
import { replaceMenu, updateHotelContent } from "./hotel-admin.service";

const PATH = "/dashboard/hotel"; // adjust to your route
const UNEXPECTED: ActionResult = { ok: false, message: "Something went wrong. Please try again." };

export async function saveHotelContentAction(hotelId: string, input: unknown): Promise<ActionResult> {
  try {
    const res = await updateHotelContent(hotelId, input);
    if (res.ok) revalidatePath(PATH);
    return res;
  } catch (e) {
    console.error("[hotel] save action failed", e);
    return UNEXPECTED;
  }
}

export async function replaceMenuAction(formData: FormData): Promise<ActionResult> {
  try {
    const hotelId = formData.get("hotelId");
    const file = formData.get("file");
    if (typeof hotelId !== "string" || !(file instanceof File)) {
      return { ok: false, message: "Please choose a PDF to upload." };
    }
    const res = await replaceMenu(hotelId, file);
    if (res.ok) revalidatePath(PATH);
    return res;
  } catch (e) {
    console.error("[hotel] menu action failed", e);
    return UNEXPECTED;
  }
}