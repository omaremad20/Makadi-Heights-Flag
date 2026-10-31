"use client";

import { type ComponentProps } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

import { CONTROL_CLASS, FormField } from "@/components/applications/form-field";
import { PhoneField } from "@/components/applications/phone-field";
import { Input } from "@/components/ui/input";
import type { ApplicationFormValues } from "@/lib/applications/form-schema";

export function AdditionalPersons() {
  const {
    control,
    register,
    formState: { errors },
  } = useFormContext<ApplicationFormValues>();
  const { fields } = useFieldArray({
    control,
    name: "additional_persons",
  });

  const listError =
    errors.additional_persons?.root?.message ??
    errors.additional_persons?.message;

  return (
    <div className="grid gap-4 sm:col-span-2">
      {fields.length === 0 && (
        <p className="text-sm text-neutral-600">No additional members added.</p>
      )}

      {fields.length > 0 && (
        <ul className="grid gap-4">
          {fields.map((field, index) => {
            const row = errors.additional_persons?.[index];
            const n = index + 1;
            return (
              <li key={field.id}>
                <fieldset className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
                  <legend className="px-1 text-sm font-medium text-neutral-900">
                    Additional Member {n}
                  </legend>

                  <FormField
                    id={`person-${index}-name`}
                    label="Name"
                    required
                    hint="First and last name"
                    error={row?.name?.message}
                  >
                    {(a11y) => (
                      <ControlInput
                        {...a11y}
                        autoComplete="off"
                        {...register(`additional_persons.${index}.name`)}
                      />
                    )}
                  </FormField>

                  <FormField
                    id={`person-${index}-relative`}
                    label="Relative"
                    optional
                    error={row?.relative?.message}
                  >
                    {(a11y) => (
                      <ControlInput
                        {...a11y}
                        autoComplete="off"
                        placeholder="e.g. Son, Daughter, Brother"
                        {...register(`additional_persons.${index}.relative`)}
                      />
                    )}
                  </FormField>

                  <PhoneField
                    id={`person-${index}-mobile`}
                    name={`additional_persons.${index}.mobile`}
                    label="Mobile"
                    optional
                    className="sm:col-span-2"
                  />
                </fieldset>
              </li>
            );
          })}
        </ul>
      )}

      {listError && <p className="text-sm text-destructive">{listError}</p>}
    </div>
  );
}

// Keeps the repeated control styling in one place.
function ControlInput(props: ComponentProps<"input">) {
  return <Input {...props} className={CONTROL_CLASS} />;
}
