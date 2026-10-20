"use client";

import { useMemo, useState, type ComponentProps } from "react";
import { AsYouType, getCountryCallingCode, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";

import { CONTROL_CLASS } from "@/components/applications/form-field";
import { SearchableSelect, type SearchableOption } from "@/components/applications/searchable-select";
import { Input } from "@/components/ui/input";
import { getCallingCodeCountries } from "@/lib/applications/calling-codes";
import { flagEmoji } from "@/lib/applications/nationalities";

const DEFAULT_COUNTRY: CountryCode = "EG";

type Props = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "defaultValue"> & {
  /** Form value: "" or an E.164 string such as "+201012345678". Read once on mount; the component then owns the display text. */
  value: string;
  onChange: (value: string) => void;
};

/** What goes into the form: E.164 when parseable, a non-empty (invalid) "+<digits>" while incomplete, "" when blank. */
function toValue(ayt: AsYouType, raw: string, country: CountryCode): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const parsed = ayt.getNumber()?.number;
  if (parsed) return parsed;
  return raw.trim().startsWith("+") ? `+${digits}` : `+${getCountryCallingCode(country)}${digits}`;
}

/**
 * Country calling-code picker + as-you-type formatted national number.
 * Emits E.164 only; validity is checked by the form schema (libphonenumber-js).
 */
export function PhoneInput({ value, onChange, onBlur, ...inputProps }: Props) {
  const [country, setCountry] = useState<CountryCode>(
    () => (value ? parsePhoneNumberFromString(value)?.country : undefined) ?? DEFAULT_COUNTRY,
  );
  const [text, setText] = useState(() => (value ? (parsePhoneNumberFromString(value)?.formatNational() ?? value) : ""));

  const options = useMemo<SearchableOption[]>(
    () =>
      getCallingCodeCountries().map((c) => ({
        value: c.code,
        label: c.name,
        prefix: flagEmoji(c.code),
        detail: `+${c.callingCode}`,
        keywords: [c.code, `+${c.callingCode}`, c.callingCode],
      })),
    [],
  );

  function update(raw: string, current: CountryCode) {
    const international = raw.trim().startsWith("+");
    const ayt = new AsYouType(international ? undefined : current);
    setText(ayt.input(raw));

    let next = current;
    const detected = international ? ayt.getCountry() : undefined;
    if (detected && detected !== current) {
      next = detected;
      setCountry(detected);
    }
    onChange(toValue(ayt, raw, next));
  }

  function changeCountry(code: string) {
    const next = code as CountryCode;
    setCountry(next);
    const trimmed = text.trim();
    const national = trimmed.startsWith("+") ? (parsePhoneNumberFromString(trimmed)?.nationalNumber ?? "") : text;
    const ayt = new AsYouType(next);
    setText(ayt.input(national));
    onChange(toValue(ayt, national, next));
  }

  const selected = options.find((o) => o.value === country);

  return (
    <div className="flex gap-2">
      <SearchableSelect
        options={options}
        value={country}
        onChange={changeCountry}
        placeholder="Code"
        searchPlaceholder="Search country or code"
        emptyText="No country found."
        aria-label={`Country calling code, ${selected?.label ?? ""} ${selected?.detail ?? ""}`.trim()}
        aria-invalid={inputProps["aria-invalid"]}
        className="w-32 shrink-0"
        contentClassName="w-80"
        renderValue={(o) => (
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true">{o?.prefix}</span>
            <span>{o?.detail}</span>
          </span>
        )}
      />
      <Input
        {...inputProps}
        type="tel"
        inputMode="tel"
        value={text}
        onChange={(e) => update(e.target.value, country)}
        onBlur={onBlur}
        className={`${CONTROL_CLASS} min-w-0 flex-1`}
      />
    </div>
  );
}