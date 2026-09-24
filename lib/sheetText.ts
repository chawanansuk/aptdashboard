/**
 * Formula-injection guard for everything we send to Apps Script.
 *
 * Apps Script writes with setValue()/appendRow(), which Google Sheets
 * parses exactly like typed input: a value starting with "=" (and "+",
 * "-", "@") becomes a FORMULA. Both read paths (getRooms_ and the
 * published CSV) then return the formula's RESULT — so a sales user
 * could save a room note "=TEXTJOIN(…,ห้อง!E2:F400)" and read every
 * tenant's name/phone back through the note, which the API never strips.
 *
 * A leading apostrophe is Sheets' "this is text" marker: the cell shows
 * and returns the text without it. Plain numbers ("-3", "+66 81 234
 * 5678") are left alone so numeric fields keep their current behaviour.
 *
 * `match*` keys and `id` locate an EXISTING row by its stored values, so
 * they are passed through untouched.
 */

const FORMULA_START = /^[=+\-@]/;
const PLAIN_NUMBER = /^[+-]?\d[\d\s,.]*$/;

export function asSheetText(v: string): string {
  return FORMULA_START.test(v) && !PLAIN_NUMBER.test(v) ? `'${v}` : v;
}

function isIdentityKey(key: string): boolean {
  return key === "id" || key.startsWith("match");
}

export function neutralizeFormulas<T>(value: T): T {
  if (typeof value === "string") return asSheetText(value) as T;
  if (Array.isArray(value)) return value.map((v) => neutralizeFormulas(v)) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = isIdentityKey(k) ? v : neutralizeFormulas(v);
    return out as T;
  }
  return value;
}
