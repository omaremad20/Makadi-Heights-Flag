import type { ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FieldA11yProps = {
  id: string;
  "aria-invalid": boolean;
  "aria-describedby"?: string;
  "aria-required"?: boolean;
};

/** Shared control styling: 44px height, brand focus colours (tokens from globals.css). */
export const CONTROL_CLASS =
  "h-11 bg-white focus-visible:border-brand-secondary focus-visible:ring-brand-primary/50";
export const SELECT_CLASS =
  "w-full bg-white data-[size=default]:h-11 focus-visible:border-brand-secondary focus-visible:ring-brand-primary/50";

type Props = {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: (a11y: FieldA11yProps) => ReactNode;
};

/** Label + control + hint + error, wired together with aria-describedby. */
export function FormField({
  id,
  label,
  required,
  optional,
  hint,
  error,
  className,
  children,
}: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <Label htmlFor={id} className="text-sm font-medium text-neutral-900">
        {label}
        {required && (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        )}
        {optional && (
          <span className="font-normal text-neutral-600">(optional)</span>
        )}
      </Label>
      {children({
        id,
        "aria-invalid": Boolean(error),
        "aria-describedby": describedBy,
        "aria-required": required || undefined,
      })}
      {hint && (
        <p id={hintId} className="text-xs text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
