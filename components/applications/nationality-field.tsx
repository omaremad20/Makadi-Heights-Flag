"use client";

import { useMemo } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { X } from "lucide-react";

import { FormField } from "@/components/applications/form-field";
import {
  SearchableSelect,
  type SearchableOption,
} from "@/components/applications/searchable-select";
import { Button } from "@/components/ui/button";
import type { ApplicationFormValues } from "@/lib/applications/form-schema";
import {
  flagEmoji,
  getNationalityCountries,
} from "@/lib/applications/nationalities";

/** Searchable country picker for every nationality field. Stores the English country name. */
export function NationalityField({
  name,
  label,
  required,
  className,
}: {
  name: "nationality" | "partner_nationality";
  label: string;
  required?: boolean;
  className?: string;
}) {
  const { control } = useFormContext<ApplicationFormValues>();
  const options = useMemo<SearchableOption[]>(
    () =>
      getNationalityCountries().map((c) => ({
        value: c.name,
        label: c.name,
        prefix: flagEmoji(c.code),
        keywords: [c.code],
      })),
    [],
  );

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <FormField
          id={name}
          label={label}
          required={required}
          error={fieldState.error?.message}
          className={className}
        >
          {(a11y) => (
            <div className="flex items-center gap-2">
              <SearchableSelect
                {...a11y}
                ref={field.ref}
                onBlur={field.onBlur}
                options={options}
                value={field.value}
                onChange={field.onChange}
                placeholder="Select a country"
                searchPlaceholder="Search countries"
                emptyText="No country found."
              />
              {!required && field.value !== "" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Clear ${label.toLowerCase()}`}
                  onClick={() => field.onChange("")}
                >
                  <X aria-hidden="true" />
                </Button>
              )}
            </div>
          )}
        </FormField>
      )}
    />
  );
}
