/**
 * Country list for the nationality combobox.
 * ISO 3166-1 alpha-2 codes (249) + XK (Kosovo, user-assigned but widely used).
 * Names come from the platform's CLDR data via Intl.DisplayNames, so no data package is needed.
 *
 * Stored value = the English country name (e.g. "Egypt"). The database column is free text
 * (1–64 chars), so the payload shape is unchanged.
 */
const ISO_CODES = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ
EC EE EG EH ER ES ET
FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU
ID IE IL IM IN IO IQ IR IS IT
JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ
LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ
OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY
QA
RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ
UA UG UM US UY UZ
VA VC VE VG VI VN VU
WF WS
XK
YE YT
ZA ZM ZW
`
  .trim()
  .split(/\s+/);

export type Country = { code: string; name: string };

let regionNames: Intl.DisplayNames | undefined;

export function regionName(code: string): string {
  regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
  return regionNames.of(code) ?? code;
}

let cache: Country[] | undefined;

/** All countries, sorted by English name. */
export function getNationalityCountries(): Country[] {
  cache ??= ISO_CODES.map((code) => ({ code, name: regionName(code) }))
    .filter((c) => c.name !== c.code)
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return cache;
}

/** Regional-indicator flag emoji (renders as letters on platforms without flag glyphs). */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(
    ...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
