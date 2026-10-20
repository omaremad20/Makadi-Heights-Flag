import { z } from "zod";

/* ---- Menu upload config: change limits here only ---- */
export const MENU_BUCKET = "menu";
export const MENU_MAX_MB = 1; // must match the Storage bucket file_size_limit (1 MB)
export const MENU_MAX_BYTES = MENU_MAX_MB * 1024 * 1024;

/* Set to false if the hotel columns are real jsonb (not text holding JSON). */
export const STORE_JSON_AS_STRING = true;

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
export const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const required = (label: string) => z.string().trim().min(1, `${label} is required`);
const time = (label: string) => required(label).regex(TIME_RE, "Use a valid time (HH:MM)");
const price = z
  .number({ error: "Enter a valid number" })
  .finite("Enter a valid number")
  .min(0, "Must be 0 or more");

type IssueCtx = {
  addIssue: (i: { code: "custom"; message: string; path: (string | number)[] }) => void;
};
function uniqueIds(items: { id: string }[], ctx: IssueCtx) {
  const seen = new Set<string>();
  items.forEach((it, i) => {
    if (seen.has(it.id)) ctx.addIssue({ code: "custom", message: "Duplicate ID", path: [i, "id"] });
    seen.add(it.id);
  });
}

// looseObject keeps unknown keys already stored in the JSON.
export const beachMethodSchema = z.looseObject({
  id: required("ID"),
  per: required("Billing period"),
  price: price.nullable().optional(),
  link: z.string().nullable().optional(),
  title: required("Title"),
  description: required("Description"),
});
export const beachMethodsSchema = z.array(beachMethodSchema).superRefine((a, c) => uniqueIds(a, c));

export const aquaSlotSchema = z
  .looseObject({
    id: required("ID"),
    label: required("Label"),
    start_time: time("Start time"),
    end_time: time("End time"),
    is_break: z.boolean().optional(),
  })
  .superRefine((s, ctx) => {
    if (toMinutes(s.end_time) <= toMinutes(s.start_time)) {
      ctx.addIssue({ code: "custom", message: "End must be after start", path: ["end_time"] });
    }
  });
export const aquaparkSchema = z.looseObject({
  price,
  schedule: z.array(aquaSlotSchema).min(1, "Add at least one schedule entry").superRefine((a, c) => uniqueIds(a, c)),
});

export const diningEntrySchema = z.looseObject({
  id: required("ID"),
  name: required("Name"),
  price: required("Price"),
  start_time: time("Start time"),
  end_time: time("End time"),
  description: required("Description"),
});
export const diningSchema = z.array(diningEntrySchema).superRefine((a, c) => uniqueIds(a, c));

/** The ONLY editable payload (audit/id fields are intentionally absent). */
export const hotelContentSchema = z.object({
  beach_access_methods: beachMethodsSchema,
  aquapark: aquaparkSchema,
  dining: diningSchema,
});

export type BeachMethod = z.infer<typeof beachMethodSchema>;
export type AquaSlot = z.infer<typeof aquaSlotSchema>;
export type Aquapark = z.infer<typeof aquaparkSchema>;
export type DiningEntry = z.infer<typeof diningEntrySchema>;
export type HotelContent = z.infer<typeof hotelContentSchema>;

export type Hotel = HotelContent & {
  id: string;
  name: string;
  menu_link: string | null;
  created_at: string | null;
  updated_at: string | null;
  /** Audit data is read-only and set by the database; never sent back on update. */
  created_by_email: string | null;
  last_updated_by_email: string | null;
};

export type ActionResult =
  | { ok: true; message: string; warning?: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".");
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}