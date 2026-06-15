/**
 * Money formatting + parsing — single source of truth for THB.
 *
 * Replaces the three divergent `formatBaht` functions that were copy-
 * pasted across the codebase (`lib/taskCost.ts`, `components/RoomModal.tsx`,
 * `components/SalesPipelineView.tsx`) and the `parseInt(s.replace(...))`
 * idiom that was duplicated in 8 sites. The old `taskCost.formatBaht`
 * re-exports from here so existing callers don't churn.
 *
 * Inputs from the sheet are messy: prices come as free-text ("3500",
 * "3,500", "3,500 บาท", " 3500"), and money fields in our own UI
 * include their formatted commas + a "฿" suffix. Centralizing the
 * parse means every site strips whitespace + non-digits the same way.
 */

/**
 * Parse a free-text money string to a number. Strips commas, spaces,
 * the "฿" sign, and any other non-digits. Returns `NaN` for empty /
 * unparseable input — callers that want a numeric default should use
 * `parsePriceOr0`.
 */
export function parsePrice(s: string | number | null | undefined): number {
  if (s === null || s === undefined || s === "") return NaN;
  if (typeof s === "number") return Number.isFinite(s) ? s : NaN;
  const trimmed = String(s).trim();
  // Reject leading-minus explicitly. The digit-strip below would silently
  // discard the sign and turn "-100" into 100 — the old taskCost
  // parseCostInput behavior treated it as invalid (parseFloat returned
  // -100, then the >0 guard zeroed it), so callers across the app expect
  // negative strings to become NaN/0.
  if (trimmed.startsWith("-")) return NaN;
  // Strip ALL non-digits and read as integer baht. This is deliberate:
  // "." is a THOUSANDS separator in this app's data ("8.500" = 8500),
  // not a decimal point — Thai rents are whole baht. See
  // SalesPipelineView.test ("8.500" → "8,500"). A pasted "5,500.00"
  // becoming 550000 is an accepted edge of that convention; disambiguating
  // dot-as-sep from dot-as-decimal isn't reliably possible.
  const digits = trimmed.replace(/[^0-9]/g, "");
  if (!digits) return NaN;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) ? n : NaN;
}

/** Like `parsePrice` but coerces NaN/invalid to 0 — for sum/display code. */
export function parsePriceOr0(s: string | number | null | undefined): number {
  const n = parsePrice(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export interface FormatBahtOptions {
  /** Suffix appended after the number. Default `" ฿"`. Pass `""` for input fields. */
  suffix?: string;
  /** Treat 0 as a displayable value (returns "0[suffix]") instead of "". Default false. */
  showZero?: boolean;
}

/**
 * Format a number (or a free-text money string) for display.
 *   formatBaht(1500)              → "1,500 ฿"
 *   formatBaht("1500")            → "1,500 ฿"   (parses input first)
 *   formatBaht(1500, {suffix:""}) → "1,500"      (for input fields)
 *   formatBaht(0)                  → ""           (default: hide zero)
 *   formatBaht(NaN | null | "")    → ""
 */
export function formatBaht(
  value: number | string | null | undefined,
  opts: FormatBahtOptions = {},
): string {
  const { suffix = " ฿", showZero = false } = opts;
  const n = typeof value === "number" ? value : parsePrice(value);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0 && !showZero) return "";
  return n.toLocaleString("th-TH") + suffix;
}
