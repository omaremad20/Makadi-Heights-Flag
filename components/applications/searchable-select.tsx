"use client";

import { useState, type ComponentProps, type ReactNode, type Ref } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableOption = {
  value: string;
  label: string;
  /** Extra text the search also matches (country code, calling code…). */
  keywords?: string[];
  prefix?: string;
  detail?: string;
};

type Props = Omit<
  ComponentProps<"button">,
  "value" | "onChange" | "onBlur" | "children" | "type" | "role" | "ref"
> & {
  /** Called when the list closes, so the form can mark the field as touched. */
  onBlur?: () => void;
  options: SearchableOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchPlaceholder: string;
  emptyText: string;
  renderValue?: (selected: SearchableOption | undefined) => ReactNode;
  contentClassName?: string;
  ref?: Ref<HTMLButtonElement>;
};

/** Popover + Command combobox: type to filter, arrow keys to move, Enter to select, Escape to close. */
export function SearchableSelect({
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  searchPlaceholder,
  emptyText,
  renderValue,
  contentClassName,
  className,
  ref,
  ...triggerProps
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) onBlur?.();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          {...triggerProps}
          ref={ref}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "h-11 w-full justify-between bg-white px-3 font-normal focus-visible:border-brand-secondary focus-visible:ring-brand-primary/50",
            className,
          )}
        >
          <span
            className={cn("truncate", !selected && "text-muted-foreground")}
          >
            {renderValue
              ? renderValue(selected)
              : (selected?.label ?? placeholder)}
          </span>
          <ChevronsUpDown
            aria-hidden="true"
            className="size-4 shrink-0 opacity-50"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-(--radix-popover-trigger-width) min-w-64 p-0",
          contentClassName,
        )}
      >
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  keywords={o.keywords}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.prefix && <span aria-hidden="true">{o.prefix}</span>}
                  <span className="truncate">{o.label}</span>
                  {o.detail && (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {o.detail}
                    </span>
                  )}
                  <Check
                    aria-hidden="true"
                    className={cn(
                      "size-4",
                      o.detail ? "ml-2" : "ml-auto",
                      o.value === value ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
