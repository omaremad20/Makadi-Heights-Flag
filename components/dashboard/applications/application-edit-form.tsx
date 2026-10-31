"use client";

import { useEffect, useState, useTransition } from "react";
import { Controller, FormProvider, useFieldArray, useForm, useFormContext, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { CONTROL_CLASS, FormField } from "@/components/applications/form-field";
import { NationalityField } from "@/components/applications/nationality-field";
import { PhoneField } from "@/components/applications/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { updateApplicationAction } from "@/lib/applications/actions";
import {
  applicationFormSchema,
  MEMBERSHIP_TYPE_LABELS,
  PERIOD_LABELS,
  UNAVAILABLE_PERIODS,
  USER_TYPE_LABELS,
  type ApplicationFormValues,
} from "@/lib/applications/form-schema";
import { wouldRequireRereview } from "@/lib/applications/rereview";
import type { ApplicationRow } from "@/lib/applications/types";
import { MAX_TOTAL_HEADCOUNT, MEMBERSHIP_TYPES, PERIODS, USER_TYPES } from "@/lib/applications/vaildation";

function toFormValues(a: ApplicationRow): ApplicationFormValues {
  return {
    period: (PERIODS as readonly string[]).includes(a.period) ? (a.period as ApplicationFormValues["period"]) : "week",
    membership_type: (MEMBERSHIP_TYPES as readonly string[]).includes(a.membership_type ?? "")
      ? (a.membership_type as ApplicationFormValues["membership_type"])
      : "clubhouse_only",
    user_type: (USER_TYPES as readonly string[]).includes(a.user_type ?? "") ? (a.user_type as ApplicationFormValues["user_type"]) : "",
    full_name: a.full_name,
    unit_number: a.unit_number,
    mobile: a.mobile ?? "",
    email: a.email ?? "",
    nationality: a.nationality ?? "",
    partner_name: a.partner_name ?? "",
    partner_nationality: a.partner_nationality ?? "",
    partner_mobile: a.partner_mobile ?? "",
    partner_email: a.partner_email ?? "",
    additional_persons: (a.additional_persons ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      relative: p.relative ?? "",
      mobile: p.mobile ?? "",
    })),
  };
}

function TextInput({ name, label, required, optional }: { name: "full_name" | "unit_number" | "email" | "partner_name" | "partner_email"; label: string; required?: boolean; optional?: boolean }) {
  const { register, formState: { errors } } = useFormContext<ApplicationFormValues>();
  return (
    <FormField id={`edit-${name}`} label={label} required={required} optional={optional} error={errors[name]?.message}>
      {(a11y) => <Input {...a11y} {...register(name)} className={CONTROL_CLASS} autoComplete="off" />}
    </FormField>
  );
}

function EnumSelect<T extends string>({ name, label, values, labels, disabledValues = [], allowEmpty }: {
  name: "period" | "membership_type" | "user_type";
  label: string;
  values: readonly T[];
  labels: Record<T, string>;
  disabledValues?: readonly string[];
  allowEmpty?: boolean;
}) {
  const { control, formState: { errors } } = useFormContext<ApplicationFormValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <FormField id={`edit-${name}`} label={label} required={!allowEmpty} optional={allowEmpty} error={errors[name]?.message}>
          {(a11y) => (
            <Select value={field.value || "__none"} onValueChange={(v) => field.onChange(v === "__none" ? "" : v)}>
              <SelectTrigger {...a11y} ref={field.ref} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowEmpty && <SelectItem value="__none">Not specified</SelectItem>}
                {values.map((v) => (
                  <SelectItem key={v} value={v} disabled={disabledValues.includes(v) && field.value !== v}>
                    {labels[v]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </FormField>
      )}
    />
  );
}

function AdditionalPeopleEditor({ maxAdditional }: { maxAdditional: number }) {
  const { control, register, formState: { errors } } = useFormContext<ApplicationFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: "additional_persons", keyName: "fieldKey" });

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Additional people</legend>
      {fields.length === 0 && <p className="text-sm text-muted-foreground">None.</p>}
      {fields.map((field, index) => {
        const row = errors.additional_persons?.[index];
        return (
          <div key={field.fieldKey} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
            <div className="flex items-center justify-between sm:col-span-2">
              <span className="text-sm font-medium">
                Person {index + 1}
                {!field.id && <span className="ml-2 text-xs text-amber-700">(new)</span>}
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={() => remove(index)} aria-label={`Remove person ${index + 1}`}>
                <Trash2 aria-hidden />
                Remove
              </Button>
            </div>
            <FormField id={`edit-person-${index}-name`} label="Name" required error={row?.name?.message}>
              {(a11y) => <Input {...a11y} {...register(`additional_persons.${index}.name`)} className={CONTROL_CLASS} autoComplete="off" />}
            </FormField>
            <FormField id={`edit-person-${index}-relative`} label="Relative" optional error={row?.relative?.message}>
              {(a11y) => <Input {...a11y} {...register(`additional_persons.${index}.relative`)} className={CONTROL_CLASS} autoComplete="off" />}
            </FormField>
            <PhoneField id={`edit-person-${index}-mobile`} name={`additional_persons.${index}.mobile`} label="Mobile" optional className="sm:col-span-2" />
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={fields.length >= maxAdditional}
        onClick={() => append({ name: "", relative: "", mobile: "" })}
      >
        <Plus aria-hidden />
        Add person
      </Button>
      {(errors.additional_persons?.message || errors.additional_persons?.root?.message) && (
        <p className="text-sm text-destructive">{errors.additional_persons?.message ?? errors.additional_persons?.root?.message}</p>
      )}
    </fieldset>
  );
}

/**
 * Admin correction form. Validation is the same as the public form. Saving is
 * guarded by optimistic concurrency (updated_at). Whether an approved
 * application returns to pending is decided ONLY by the database trigger;
 * the warning below just mirrors that rule so admins know before saving.
 */
export function ApplicationEditForm({
  application,
  onSaved,
  onConflict,
  onDirtyChange,
}: {
  application: ApplicationRow;
  onSaved: () => void;
  onConflict: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const methods = useForm<ApplicationFormValues>({
    resolver: zodResolver(applicationFormSchema),
    mode: "onTouched",
    defaultValues: toFormValues(application),
  });
  const { handleSubmit, setValue, setError, control, formState: { isDirty } } = methods;
  const [hasPartner, setHasPartner] = useState(Boolean(application.partner_name));
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => onDirtyChange(isDirty || hasPartner !== Boolean(application.partner_name)), [isDirty, hasPartner, application.partner_name, onDirtyChange]);

  const watched = useWatch({ control });
  const additional = watched.additional_persons ?? [];
  const rereview = wouldRequireRereview(
    {
      status: application.status,
      period: application.period,
      membership_type: application.membership_type,
      user_type: application.user_type,
      unit_number: application.unit_number,
      partner_name: application.partner_name,
      additional_person_ids: (application.additional_persons ?? []).map((p) => p.id ?? null),
    },
    {
      status: application.status,
      period: watched.period ?? application.period,
      membership_type: watched.membership_type ?? null,
      user_type: watched.user_type || null,
      unit_number: (watched.unit_number ?? "").trim(),
      partner_name: hasPartner ? watched.partner_name || "partner" : null,
      additional_person_ids: additional.map((p) => p?.id ?? null),
    },
  );
  const maxAdditional = MAX_TOTAL_HEADCOUNT - 1 - (hasPartner ? 1 : 0);

  const onSubmit = (values: ApplicationFormValues) => {
    setFormError(null);
    const payload: ApplicationFormValues = hasPartner
      ? values
      : { ...values, partner_name: "", partner_nationality: "", partner_mobile: "", partner_email: "" };
    startTransition(async () => {
      const res = await updateApplicationAction(application.id, payload, application.updated_at);
      if (res.ok) {
        toast.success(
          res.data.statusReset
            ? "Saved. The application went back to pending for re-review."
            : "Saved. The approval status is unchanged.",
        );
        onSaved();
        return;
      }
      if (res.code === "conflict") {
        toast.error(res.message);
        onConflict();
        return;
      }
      for (const [path, message] of Object.entries(res.fieldErrors ?? {})) {
        setError(path as Parameters<typeof setError>[0], { type: "server", message });
      }
      setFormError(res.message);
    });
  };

  return (
    <FormProvider {...methods}>
      <form noValidate onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <EnumSelect name="membership_type" label="Membership" values={MEMBERSHIP_TYPES} labels={MEMBERSHIP_TYPE_LABELS} />
          <EnumSelect name="period" label="Period" values={PERIODS} labels={PERIOD_LABELS} disabledValues={UNAVAILABLE_PERIODS} />
          <EnumSelect name="user_type" label="Applicant type" values={USER_TYPES} labels={USER_TYPE_LABELS} allowEmpty />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput name="full_name" label="Full name" required />
          <TextInput name="unit_number" label="Unit" required />
          <NationalityField name="nationality" label="Nationality" />
          <PhoneField id="edit-mobile" name="mobile" label="Mobile" optional />
          <TextInput name="email" label="Email" optional />
        </div>

        <fieldset className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <legend className="text-sm font-medium">Partner</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={hasPartner}
                onCheckedChange={(on) => {
                  setHasPartner(on);
                  if (!on) {
                    for (const f of ["partner_name", "partner_nationality", "partner_mobile", "partner_email"] as const) {
                      setValue(f, "", { shouldDirty: true });
                    }
                  }
                }}
              />
              Has a partner
            </label>
          </div>
          {hasPartner && (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput name="partner_name" label="Partner’s full name" required />
              <NationalityField name="partner_nationality" label="Nationality" />
              <PhoneField id="edit-partner-mobile" name="partner_mobile" label="Mobile" optional />
              <TextInput name="partner_email" label="Email" optional />
            </div>
          )}
        </fieldset>

        <AdditionalPeopleEditor maxAdditional={maxAdditional} />

        {rereview && (
          <p role="status" className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <RotateCcw className="mt-0.5 size-4 shrink-0" aria-hidden />
            These changes affect eligibility or the membership. Saving will send this approved application back to pending for re-review.
          </p>
        )}
        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => { methods.reset(toFormValues(application)); setHasPartner(Boolean(application.partner_name)); }}>
            Reset
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <LoaderCircle className="animate-spin" aria-hidden />}
            Save changes
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
