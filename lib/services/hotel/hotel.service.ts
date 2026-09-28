import { createClient } from "@/lib/supabase/server";
import { Serenity } from "@/lib/types";

 interface IFetchHotelData {
  status: "success" | "error";
  data?: Serenity;
}

export async function fetchHotelData(): Promise<IFetchHotelData> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("hotel")
      .select("beach_access_methods, menu_link,aquapark,dining")
      .limit(1);

    if (error || !data) {
      return { status: "error" };
    }

    return {
      status: "success",
      data: data[0],
    };
  } catch {
    return { status: "error" };
  }
}
