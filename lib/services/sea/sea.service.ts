import { createClient } from "@/lib/supabase/client";

export type SeaFlag = "red" | "blue";

export interface ISea {
  flag: SeaFlag;
  updated_at: string;
}

export type SeaFlagResult =
  | {
      status: "success";
      data: ISea;
    }
  | {
      status: "error";
    };

export function isSeaFlag(value: unknown): value is SeaFlag {
  return value === "red" || value === "blue";
}

export async function getSeaFlag(): Promise<SeaFlagResult> {
  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from("sea")
      .select("flag, updated_at,id")
      .limit(1)
      .maybeSingle();

    console.log(data);
    if (error || !data || !isSeaFlag(data.flag)) {
      return { status: "error" };
    }

    return {
      status: "success",
      data: {
        flag: data.flag,
        updated_at: data.updated_at,
      },
    };
  } catch {
    return { status: "error" };
  }
}
