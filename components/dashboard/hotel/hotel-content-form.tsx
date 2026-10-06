"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { fieldErrors, HotelContent, hotelContentSchema } from "@/lib/services/hotel/admin/schema";
import { saveHotelContentAction } from "@/lib/services/hotel/admin/hotel.actions";


/* Drafts keep prices as strings so inputs can be edited freely. */
type BeachDraft = {
  id: string;
  per: string;
  price: string;
  title: string;
  description: string;
};
type SlotDraft = {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
  is_break: boolean;
};
type DiningDraft = {
  id: string;
  name: string;
  price: string;
  start_time: string;
  end_time: string;
  description: string;
};
type Draft = {
  beach: BeachDraft[];
  aquaPrice: string;
  slots: SlotDraft[];
  dining: DiningDraft[];
};

const pad = (t: string) => (/^\d:/.test(t) ? `0${t}` : t); // "9:30" -> "09:30" for <input type=time>
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));

function toDraft(c: HotelContent): Draft {
  return {
    beach: c.beach_access_methods.map((m) => ({
      id: m.id,
      per: m.per,
      price: String(m.price),
      title: m.title,
      description: m.description,
    })),
    aquaPrice: String(c.aquapark.price),
    slots: c.aquapark.schedule.map((s) => ({
      id: s.id,
      label: s.label,
      start_time: pad(s.start_time),
      end_time: pad(s.end_time),
      is_break: !!s.is_break,
    })),
    dining: c.dining.map((d) => ({
      id: d.id,
      name: d.name,
      price: d.price,
      start_time: pad(d.start_time),
      end_time: pad(d.end_time),
      description: d.description,
    })),
  };
}

function toPayload(d: Draft) {
  return {
    beach_access_methods: d.beach.map((m) => ({ ...m, price: num(m.price) })),
    aquapark: {
      price: num(d.aquaPrice),
      schedule: d.slots.map((s) =>
        s.is_break
          ? s
          : {
              id: s.id,
              label: s.label,
              start_time: s.start_time,
              end_time: s.end_time,
            },
      ),
    },
    dining: d.dining,
  };
}

const patchAt = <T,>(arr: T[], i: number, p: Partial<T>) =>
  arr.map((x, j) => (j === i ? { ...x, ...p } : x));

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="flex flex-col items-start gap-1.5">
        {label}
        {children}
      </Label>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function HotelContentForm({
  hotelId,
  content,
}: {
  hotelId: string;
  content: HotelContent;
}) {
  const router = useRouter();
  const initial = useMemo(() => toDraft(content), [content]);
  const [draft, setDraft] = useState<Draft>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const countErrors = (prefix: string) =>
    Object.keys(errors).filter((k) => k.startsWith(prefix)).length;

  function save() {
    if (pending) return;
    const parsed = hotelContentSchema.safeParse(toPayload(draft));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      toast.error("Please fix the highlighted fields.");
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await saveHotelContentAction(hotelId, parsed.data);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        toast.error(res.message);
      }
    });
  }

  const tab = (value: string, label: string, prefix: string) => {
    const n = countErrors(prefix);
    return (
      <TabsTrigger value={value}>
        {label}
        {n > 0 && (
          <span className="ml-1.5 rounded-full bg-destructive px-1.5 text-[10px] text-white">
            {n}
          </span>
        )}
      </TabsTrigger>
    );
  };

  return (
    <div className="space-y-4">
      <fieldset disabled={pending} className="m-0 min-w-0 border-0 p-0">
        <Tabs defaultValue="beach">
          <TabsList>
            {tab("beach", "Beach access", "beach_access_methods")}
            {tab("aqua", "Aqua park", "aquapark")}
            {tab("dining", "Dining", "dining")}
          </TabsList>

          {/* ---- Beach ---- */}
          <TabsContent value="beach" className="space-y-3">
            {draft.beach.map((m, i) => {
              const k = `beach_access_methods.${i}`;
              const set = (p: Partial<BeachDraft>) =>
                setDraft({ ...draft, beach: patchAt(draft.beach, i, p) });
              return (
                <Card key={m.id}>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-muted-foreground">
                        ID: {m.id}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${m.title || "method"}`}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            beach: draft.beach.filter((_, j) => j !== i),
                          })
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {errors[`${k}.id`] && (
                      <p className="text-xs text-destructive">
                        {errors[`${k}.id`]}
                      </p>
                    )}
                    <div className="grid gap-3 sm:grid-cols-3">
                      <Field
                        label="Title"
                        error={errors[`${k}.title`]}
                        className="sm:col-span-1"
                      >
                        <Input
                          value={m.title}
                          aria-invalid={!!errors[`${k}.title`]}
                          onChange={(e) => set({ title: e.target.value })}
                        />
                      </Field>
                      <Field label="Price" error={errors[`${k}.price`]}>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={m.price}
                          aria-invalid={!!errors[`${k}.price`]}
                          onChange={(e) => set({ price: e.target.value })}
                        />
                      </Field>
                      <Field label="Per" error={errors[`${k}.per`]}>
                        <Input
                          value={m.per}
                          placeholder="Per Day"
                          aria-invalid={!!errors[`${k}.per`]}
                          onChange={(e) => set({ per: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field
                      label="Description"
                      error={errors[`${k}.description`]}
                    >
                      <Textarea
                        rows={2}
                        value={m.description}
                        aria-invalid={!!errors[`${k}.description`]}
                        onChange={(e) => set({ description: e.target.value })}
                      />
                    </Field>
                  </CardContent>
                </Card>
              );
            })}
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setDraft({
                  ...draft,
                  beach: [
                    ...draft.beach,
                    {
                      id: crypto.randomUUID(),
                      per: "",
                      price: "0",
                      title: "",
                      description: "",
                    },
                  ],
                })
              }
            >
              <Plus /> Add method
            </Button>
          </TabsContent>

          {/* ---- Aqua park ---- */}
          <TabsContent value="aqua" className="space-y-3">
            <Card>
              <CardContent>
                <Field
                  label="Ticket price"
                  error={errors["aquapark.price"]}
                  className="max-w-xs"
                >
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={draft.aquaPrice}
                    aria-invalid={!!errors["aquapark.price"]}
                    onChange={(e) =>
                      setDraft({ ...draft, aquaPrice: e.target.value })
                    }
                  />
                </Field>
              </CardContent>
            </Card>
            {errors["aquapark.schedule"] && (
              <p className="text-xs text-destructive">
                {errors["aquapark.schedule"]}
              </p>
            )}
            {draft.slots.map((s, i) => {
              const k = `aquapark.schedule.${i}`;
              const set = (p: Partial<SlotDraft>) =>
                setDraft({ ...draft, slots: patchAt(draft.slots, i, p) });
              return (
                <Card key={s.id}>
                  <CardContent className="grid items-end gap-3 sm:grid-cols-[1fr_8rem_8rem_auto]">
                    <Field
                      label="Label"
                      error={errors[`${k}.label`] ?? errors[`${k}.id`]}
                    >
                      <Input
                        value={s.label}
                        aria-invalid={!!errors[`${k}.label`]}
                        onChange={(e) => set({ label: e.target.value })}
                      />
                    </Field>
                    <Field label="Start" error={errors[`${k}.start_time`]}>
                      <Input
                        type="time"
                        value={s.start_time}
                        aria-invalid={!!errors[`${k}.start_time`]}
                        onChange={(e) => set({ start_time: e.target.value })}
                      />
                    </Field>
                    <Field label="End" error={errors[`${k}.end_time`]}>
                      <Input
                        type="time"
                        value={s.end_time}
                        aria-invalid={!!errors[`${k}.end_time`]}
                        onChange={(e) => set({ end_time: e.target.value })}
                      />
                    </Field>
                    <Label className="flex items-center gap-2 pb-2">
                      <Switch
                        checked={s.is_break}
                        onCheckedChange={(v) => set({ is_break: v })}
                      />{" "}
                      Break
                    </Label>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ---- Dining ---- */}
          <TabsContent value="dining" className="space-y-3">
            {draft.dining.map((d, i) => {
              const k = `dining.${i}`;
              const set = (p: Partial<DiningDraft>) =>
                setDraft({ ...draft, dining: patchAt(draft.dining, i, p) });
              return (
                <Card key={d.id}>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-4">
                      <Field
                        label="Name"
                        error={errors[`${k}.name`] ?? errors[`${k}.id`]}
                        className="sm:col-span-2"
                      >
                        <Input
                          value={d.name}
                          aria-invalid={!!errors[`${k}.name`]}
                          onChange={(e) => set({ name: e.target.value })}
                        />
                      </Field>
                      <Field label="Start" error={errors[`${k}.start_time`]}>
                        <Input
                          type="time"
                          value={d.start_time}
                          aria-invalid={!!errors[`${k}.start_time`]}
                          onChange={(e) => set({ start_time: e.target.value })}
                        />
                      </Field>
                      <Field label="End" error={errors[`${k}.end_time`]}>
                        <Input
                          type="time"
                          value={d.end_time}
                          aria-invalid={!!errors[`${k}.end_time`]}
                          onChange={(e) => set({ end_time: e.target.value })}
                        />
                      </Field>
                    </div>
                    <Field label="Price" error={errors[`${k}.price`]}>
                      <Input
                        value={d.price}
                        placeholder="450 EGP"
                        aria-invalid={!!errors[`${k}.price`]}
                        onChange={(e) => set({ price: e.target.value })}
                      />
                    </Field>
                    <Field
                      label="Description"
                      error={errors[`${k}.description`]}
                    >
                      <Textarea
                        rows={2}
                        value={d.description}
                        aria-invalid={!!errors[`${k}.description`]}
                        onChange={(e) => set({ description: e.target.value })}
                      />
                    </Field>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>
      </fieldset>

      <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-2 border-t bg-background/95 px-4 py-3 mt-5 backdrop-blur md:-mx-6 md:px-6">
        <span className="text-sm text-muted-foreground">
          {dirty ? "Unsaved changes" : "All changes saved"}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!dirty || pending}
            onClick={() => {
              setDraft(initial);
              setErrors({});
            }}
          >
            <RotateCcw /> Reset
          </Button>
          <Button type="button" disabled={!dirty || pending} onClick={save}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
