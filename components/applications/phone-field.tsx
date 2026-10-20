"use client";

import { Controller, useFormContext } from "react-hook-form";

import { FormField } from "@/components/applications/form-field";
import { PhoneInput } from "@/components/applications/phone-input";
import type { ApplicationFormValues } from "@/lib/applications/form-schema";

export type PhoneFieldName =
  | "mobile"
  | "partner_mobile"
  | `additional_persons.${number}.mobile`;

/** Label + error handling + RHF binding around PhoneInput. Required/optional comes from the schema; this only labels it. */
export function PhoneField({
  id,
  name,
  label,
  required,
  optional,
  hint,
  className,
  autoComplete = "off",
}: {
  id: string;
  name: PhoneFieldName;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  className?: string;
  autoComplete?: string;
}) {
  const { control } = useFormContext<ApplicationFormValues>();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          id={id}
          label={label}
          required={required}
          optional={optional}
          hint={hint}
          error={fieldState.error?.message}
          className={className}
        >
          {(a11y) => (
            <PhoneInput
              {...a11y}
              ref={field.ref}
              name={field.name}
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              autoComplete={autoComplete}
              placeholder="Phone number"
            />
          )}
        </FormField>
      )}
    />
  );
}
