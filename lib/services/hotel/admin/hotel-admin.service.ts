import { createClient } from "@/lib/supabase/server"; // adjust to your existing server client util
import { z } from "zod";
import { extractMenuObjectPath } from "./menu-path";
import {
  MENU_BUCKET,
  MENU_MAX_BYTES,
  aquaparkSchema,
  beachMethodsSchema,
  diningSchema,
  fieldErrors,
  hotelContentSchema,
  type ActionResult,
  type Hotel
} from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type HotelResult =
  | { status: "ok"; hotel: Hotel }
  | { status: "unauthenticated" }
  | {
      status: "forbidden";
      reason: "not_admin" | "not_approved" | "inactive" | "unknown";
    }
  | { status: "not_found" }
  | { status: "malformed" }
  | { status: "error" };

class HotelDataError extends Error {}

const PERMISSION_CODES = new Set(["42501", "PGRST301"]);
const isUuid = (v: unknown): v is string => z.uuid().safeParse(v).success;

function parseJsonField<S extends z.ZodType>(
  raw: unknown,
  schema: S,
  field: string,
): z.infer<S> {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      throw new HotelDataError(`${field}: invalid JSON`);
    }
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new HotelDataError(`${field}: ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

const rowSchema = z.looseObject({
  id: z.string().min(1),
  name: z.string().nullish(),
  menu_link: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  created_by_email_snapshot: z.string().nullish(),
  last_updated_by_email_snapshot: z.string().nullish(),
  beach_access_methods: z.unknown().optional(),
  aquapark: z.unknown().optional(),
  dining: z.unknown().optional(),
});

function toHotel(row: unknown): Hotel {
  const base = rowSchema.safeParse(row);
  if (!base.success) throw new HotelDataError("row: unexpected shape");
  const r = base.data;
  return {
    id: r.id,
    name: r.name ?? "",
    menu_link: r.menu_link ?? null,
    created_at: r.created_at ?? null,
    updated_at: r.updated_at ?? null,
    created_by_email: r.created_by_email_snapshot?.trim() || null, // "" -> null
    last_updated_by_email: r.last_updated_by_email_snapshot?.trim() || null,
    beach_access_methods: parseJsonField(
      r.beach_access_methods,
      beachMethodsSchema,
      "beach_access_methods",
    ),
    aquapark: parseJsonField(r.aquapark, aquaparkSchema, "aquapark"),
    dining: parseJsonField(r.dining, diningSchema, "dining"),
  };
}

/** Best-effort diagnosis for an empty result. ASSUMES a `profiles` table (id, role, approved, is_active). */
async function diagnose(supabase: Supabase, userId: string) {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("role, approved, is_active")
      .eq("id", userId)
      .maybeSingle();
    if (!data) return "unknown" as const;
    if (data.role !== "admin") return "not_admin" as const;
    if (!data.approved) return "not_approved" as const;
    if (!data.is_active) return "inactive" as const;
    return "ok" as const;
  } catch {
    return "unknown" as const;
  }
}

async function denied(
  supabase: Supabase,
  userId: string,
): Promise<HotelResult> {
  const reason = await diagnose(supabase, userId);
  return reason === "ok"
    ? { status: "not_found" }
    : { status: "forbidden", reason };
}

export async function getHotelForAdmin(): Promise<HotelResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthenticated" };

    const { data, error } = await supabase.from("hotel_admin").select("*");
    if (error) {
      console.error("[hotel] hotel_admin query failed", {
        code: error.code,
        message: error.message,
      });
      return PERMISSION_CODES.has(error.code)
        ? denied(supabase, user.id)
        : { status: "error" };
    }
    if (!Array.isArray(data) || data.length === 0)
      return denied(supabase, user.id);

    return { status: "ok", hotel: toHotel(data[0]) };
  } catch (e) {
    if (e instanceof HotelDataError) {
      console.error("[hotel] malformed hotel data", e.message);
      return { status: "malformed" };
    }
    console.error("[hotel] unexpected load failure", e);
    return { status: "error" };
  }
}

export async function updateHotelContent(
  hotelId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!isUuid(hotelId)) return { ok: false, message: "Invalid hotel." };

  const parsed = hotelContentSchema.safeParse(input); // never trust the client
  if (!parsed.success) {
    return {
      ok: false,
      message: "Please fix the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      ok: false,
      message: "Your session has expired. Please sign in again.",
    };

  const c = parsed.data;
  // Only managed columns; audit fields are set by the database.
  const { data, error } = await supabase
    .from("hotel")
    .update({
      beach_access_methods: c.beach_access_methods,
      aquapark: c.aquapark,
      dining: c.dining,
    })
    .eq("id", hotelId)
    .select("id");

  if (error) {
    console.error("[hotel] update failed", {
      code: error.code,
      message: error.message,
    });
    return {
      ok: false,
      message: "Your changes could not be saved. Please try again.",
    };
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      message: "You may not have permission to manage this hotel.",
    };
  }
  return { ok: true, message: "Hotel information saved." };
}

const KEPT =
  "The new menu could not be uploaded. The existing menu was kept unchanged.";

/**
 * Invariant: the DB never points at a missing file.
 *  1 validate → 2 upload NEW (unique key, no overwrite) → 3 verify it exists
 *  4 update menu_link (rollback = delete NEW file) → 5 delete OLD (failure = warning only)
 */
export async function replaceMenu(
  hotelId: string,
  file: File,
): Promise<ActionResult> {
  if (!isUuid(hotelId)) return { ok: false, message: "Invalid hotel." };

  // 1. validate
  if (file.size === 0)
    return { ok: false, message: "The selected file is empty." };
  if (file.size > MENU_MAX_BYTES)
    return { ok: false, message: "The file is too large." };
  const looksPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const magic = new TextDecoder().decode(await file.slice(0, 5).arrayBuffer());
  if (!looksPdf || magic !== "%PDF-")
    return { ok: false, message: "Only valid PDF files are allowed." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return {
      ok: false,
      message: "Your session has expired. Please sign in again.",
    };

  // Authorization + current link come from the restricted view.
  const { data: current, error: readErr } = await supabase
    .from("hotel_admin")
    .select("menu_link")
    .eq("id", hotelId)
    .maybeSingle();
  if (readErr || !current) {
    if (readErr)
      console.error("[hotel] menu: read failed", {
        code: readErr.code,
        message: readErr.message,
      });
    return {
      ok: false,
      message: "You may not have permission to manage this hotel.",
    };
  }

  const bucket = supabase.storage.from(MENU_BUCKET);
  const base =
    file.name
      .replace(/\.pdf$/i, "")
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "menu";
  const newPath = `${base}-${Date.now()}.pdf`; // unique → never overwrites the old file

  const rollback = async () => {
    const { error } = await bucket.remove([newPath]);
    if (error)
      console.error("[hotel] menu: ORPHANED new file, rollback failed", {
        newPath,
        message: error.message,
      });
  };

  // 2. upload new
  const up = await bucket.upload(newPath, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (up.error) {
    console.error("[hotel] menu: upload failed", up.error.message);
    return { ok: false, message: KEPT };
  }

  // 3. verify
  const exists = await bucket.exists(newPath);
  if (exists.error || !exists.data) {
    console.error("[hotel] menu: verify failed", exists.error?.message);
    await rollback();
    return { ok: false, message: KEPT };
  }

  // 4. point DB at the new file
  const newUrl = bucket.getPublicUrl(newPath).data.publicUrl;
  const { data: updated, error: updErr } = await supabase
    .from("hotel")
    .update({ menu_link: newUrl })
    .eq("id", hotelId)
    .select("id");
  if (updErr || !updated || updated.length === 0) {
    console.error(
      "[hotel] menu: link update failed",
      updErr?.message ?? "0 rows",
    );
    await rollback();
    return { ok: false, message: KEPT };
  }

  // 5. delete old (best effort — DB already points at a valid file)
  const oldPath = extractMenuObjectPath(
    current.menu_link,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    MENU_BUCKET,
  );
  if (!oldPath) {
    if (current.menu_link)
      console.warn(
        "[hotel] menu: old link not recognised, skipping delete",
        current.menu_link,
      );
  } else if (oldPath !== newPath) {
    const del = await bucket.remove([oldPath]);
    if (del.error) {
      console.error("[hotel] menu: old file delete failed", {
        oldPath,
        message: del.error.message,
      });
      return {
        ok: true,
        message: "Menu updated.",
        warning:
          "The new menu is live, but the previous file could not be removed from storage.",
      };
    }
  }
  return { ok: true, message: "Menu updated." };
}
