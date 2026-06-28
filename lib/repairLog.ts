/**
 * Repair log — lean "what was fixed" history layered on top of a task's
 * existing `note` field. No schema change: a ซ่อม task's note holds the
 * PROBLEM ("แอร์ไม่เย็น"); each time the engineer logs work done, we
 * append a timestamped resolution line:
 *
 *   แอร์ไม่เย็น
 *   🔧 [28/06] เติมน้ำยา ล้างคอยล์
 *   🔧 [02/07] เปลี่ยนคอมเพรสเซอร์
 *
 * The marker (🔧 [dd/MM]) is what `parseRepairLog` keys on to split the
 * problem from the resolution entries for display. Matched by a strict
 * regex so a problem line that merely mentions a date isn't mistaken for
 * a log entry.
 */

import { getBangkokNow } from "@/lib/dateUtils";

const MARKER = "🔧";
/** Matches a logged line: "🔧 [dd/MM] text". Capture date + text. */
const ENTRY_RE = /^🔧 \[(\d{2}\/\d{2})\] (.*)$/;

export interface RepairEntry {
  /** dd/MM as stored on the line. */
  date: string;
  /** The free-text resolution the engineer typed. */
  text: string;
}

export interface ParsedRepairNote {
  /** Everything before the first repair-log line — the original problem. */
  problem: string;
  /** Logged resolutions, oldest first (render order). */
  entries: RepairEntry[];
}

function ddmm(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/**
 * Append a timestamped resolution line to `note`, preserving whatever is
 * already there. Returns the note unchanged when `resolution` is blank so
 * callers can pass through without guarding. Caps total length so we stay
 * under the note's 500-char schema limit (drops the OLDEST log lines
 * first, never the problem text).
 */
export function appendRepairLog(
  note: string,
  resolution: string,
  when: Date = getBangkokNow(),
): string {
  const clean = resolution.trim();
  if (!clean) return note;
  // Collapse internal newlines in the resolution so one entry stays one
  // line (otherwise it would parse as multiple/garbled entries).
  const oneLine = clean.replace(/\s*\n\s*/g, " ");
  const line = `${MARKER} [${ddmm(when)}] ${oneLine}`;
  const base = note.trimEnd();
  const next = base ? `${base}\n${line}` : line;
  return capLength(next);
}

/** 500 is the schema cap (lib/sheetUpdateSchema OptText(500)). */
const NOTE_MAX = 500;

/** Trim from the oldest log line down until under the cap; keep problem. */
function capLength(note: string): string {
  if (note.length <= NOTE_MAX) return note;
  const lines = note.split("\n");
  // Find the first log line — everything above it is the problem block.
  const firstLog = lines.findIndex((l) => ENTRY_RE.test(l));
  if (firstLog < 0) return note.slice(0, NOTE_MAX); // no logs, hard clip
  // Drop log lines just after the problem block until we fit.
  while (note.length > NOTE_MAX && lines.length > firstLog + 1) {
    lines.splice(firstLog, 1); // remove the oldest log line
    note = lines.join("\n");
  }
  return note.length > NOTE_MAX ? note.slice(0, NOTE_MAX) : note;
}

/**
 * Split a note into its problem text + logged resolution entries.
 * A note with no markers returns all of it as `problem`, empty entries —
 * so non-ซ่อม notes pass through untouched.
 */
export function parseRepairLog(note: string | undefined): ParsedRepairNote {
  const problemLines: string[] = [];
  const entries: RepairEntry[] = [];
  let seenEntry = false;
  for (const line of (note || "").split("\n")) {
    const m = line.match(ENTRY_RE);
    if (m) {
      seenEntry = true;
      entries.push({ date: m[1], text: m[2] });
    } else if (!seenEntry) {
      problemLines.push(line);
    }
    // Non-matching lines AFTER the first entry are ignored for parsing
    // (rare; e.g. a manual edit) — they still live in the raw note.
  }
  return { problem: problemLines.join("\n").trim(), entries };
}

/** Convenience: does this note already carry at least one repair entry? */
export function hasRepairLog(note: string | undefined): boolean {
  return ENTRY_RE.test((note || "").split("\n").find((l) => ENTRY_RE.test(l)) || "");
}
