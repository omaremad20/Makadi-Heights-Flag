import {
  getCountries,
  getCountryCallingCode,
  type CountryCode,
} from "libphonenumber-js/max";

import { regionName } from "@/lib/applications/nationalities";

export type CallingCodeCountry = {
  code: CountryCode;
  name: string;
  callingCode: string;
};

let cache: CallingCodeCountry[] | undefined;

/** Every region libphonenumber-js can dial, sorted by English name. Separate from nationality on purpose. */
export function getCallingCodeCountries(): CallingCodeCountry[] {
  cache ??= getCountries()
    .map((code) => ({
      code,
      name: regionName(code),
      callingCode: getCountryCallingCode(code),
    }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cache;
}
