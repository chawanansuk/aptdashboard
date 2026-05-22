/**
 * Browser-side CSV export helper.
 *
 * Why client-side: the dashboard already has all the rows in memory
 * for rendering — round-tripping back to Apps Script just to generate
 * a file is wasted work. The download is triggered by a synthetic
 * <a download> click which works in every modern browser without a
 * library.
 *
 * UTF-8 BOM is prepended so Excel (Windows) opens Thai correctly.
 * Without the BOM, Excel treats the file as Latin-1 and Thai chars
 * appear as garbage.
 */

/** Quote a value per RFC 4180: wrap in "..." if it contains , " or newline. */
function csvCell(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export interface CsvColumn<T> {
  /** Header label shown in the file (Thai allowed). */
  header: string;
  /** Cell value selector. Return any primitive; toString-ed by csvCell. */
  value: (row: T) => unknown;
}

/**
 * Build CSV text from rows + a column spec. Caller controls header
 * names + value mapping so this works for any entity.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows
    .map((r) => columns.map((c) => csvCell(c.value(r))).join(","))
    .join("\n");
  return `${head}\n${body}`;
}

/**
 * Trigger a download of the CSV text. Cleans up the Blob URL after
 * one tick to avoid memory leaks on repeat exports.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === "undefined") return;
  // UTF-8 BOM for Excel compatibility with Thai characters
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari finishes the download (it sometimes loses
  // the URL if we revoke synchronously).
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Convenience: build + download in one call. */
export function exportCsv<T>(
  filename: string,
  rows: T[],
  columns: CsvColumn<T>[],
): void {
  downloadCsv(filename, toCsv(rows, columns));
}
