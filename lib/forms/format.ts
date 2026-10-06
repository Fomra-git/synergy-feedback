import type { AnswerValue, FieldType, StoredFileRef } from "@/types/forms";

export interface StoredAnswer {
  field_id: string;
  field_type: string;
  field_label: string;
  value: string | null;
  value_json: unknown;
}

/** Human-readable text for an answer value (used for search, CSV, Sheets, email). */
export function answerToText(type: FieldType | string, value: AnswerValue | unknown): string {
  if (value === null || value === undefined || value === "") return "";
  switch (type) {
    case "checkbox":
    case "multi_select":
      return Array.isArray(value) ? value.join(", ") : String(value);
    case "file_upload":
      return Array.isArray(value)
        ? value.map((f) => (typeof f === "object" && f ? (f as StoredFileRef).name : String(f))).join(", ")
        : "";
    case "signature":
      return value ? "Signed" : "";
    default:
      return Array.isArray(value) ? value.join(", ") : String(value);
  }
}

/** Reconstructs the display text from a stored answer row. */
export function storedAnswerText(answer: { field_type: string; value: string | null; value_json: unknown }): string {
  if (answer.value !== null && answer.value !== undefined) return answer.value;
  return answerToText(answer.field_type, answer.value_json);
}

/**
 * Neutralises spreadsheet formula injection for CSV exports: cells starting
 * with = + - @ (or tab/CR) are prefixed with a single quote.
 */
export function csvSafeCell(input: unknown): string {
  let s = input === null || input === undefined ? "" : String(input);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function csvRow(cells: unknown[]): string {
  return cells.map(csvSafeCell).join(",") + "\r\n";
}

export function formatDateTime(iso: string | Date, timeZone = "Asia/Kolkata"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

export function formatDate(iso: string | Date, timeZone = "Asia/Kolkata"): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-IN", { timeZone, day: "2-digit", month: "short", year: "numeric" }).format(d);
}
