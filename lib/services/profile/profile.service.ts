import { createClient } from "@/lib/supabase/server";

export async function updateMyPhone(phone: string | null) {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("You must be signed in to update your phone number.");
  }

  const normalizedPhone = phone?.trim() || null;

  const { error } = await supabase
    .from("profiles")
    .update({
      phone: normalizedPhone,
    })
    .eq("id", user.id);

  if (error) {
    throw new Error("Could not update your phone number.");
  }
}