/**
 * CSV generation that is safe to open in Excel / Google Sheets.
 *  - every field is quoted; embedded quotes are doubled; line breaks kept inside quotes;
 *  - formula injection (CWE-1236): a value starting with = + - @ or a tab /
 *    carriage return is prefixed with an apostrophe so spreadsheets treat it as text.
 *  - starts with a UTF-8 BOM so Excel reads non-ASCII names correctly.
 */

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '""';
  let text = typeof value === "string" ? value : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function toCsv(header: readonly string[], rows: ReadonlyArray<readonly unknown[]>): string {
  const lines = [header, ...rows].map((r) => r.map(csvCell).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}
