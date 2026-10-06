import { answerToText } from "@/lib/forms/format";
import { isInputType } from "@/lib/forms/field-registry";
import type { FormField, FormSheetSettings } from "@/types/forms";
import type { SheetColumn } from "@/types/db";

export const META_COLUMNS = {
  submission_id: "Submission ID",
  submitted_at: "Submitted At",
  form_name: "Form Name",
  branch: "Branch",
  user_agent: "User Agent",
  ip_hash: "IP Hash",
} as const;

export type MetaColumn = keyof typeof META_COLUMNS;

/** Submission ID is always column A: it anchors duplicate detection. */
export const SUBMISSION_ID_KEY = "meta:submission_id";

function desiredColumns(fields: FormField[], settings: FormSheetSettings): SheetColumn[] {
  const cols: SheetColumn[] = [
    { key: SUBMISSION_ID_KEY, header: META_COLUMNS.submission_id },
    { key: "meta:submitted_at", header: META_COLUMNS.submitted_at },
  ];
  if (settings.includeFormName ?? true) cols.push({ key: "meta:form_name", header: META_COLUMNS.form_name });
  if (settings.includeBranch ?? true) cols.push({ key: "meta:branch", header: META_COLUMNS.branch });
  for (const f of fields) {
    if (!isInputType(f.type)) continue;
    cols.push({ key: `field:${f.field_id}`, header: f.label || f.field_id });
  }
  if (settings.includeUserAgent) cols.push({ key: "meta:user_agent", header: META_COLUMNS.user_agent });
  if (settings.includeIpHash) cols.push({ key: "meta:ip_hash", header: META_COLUMNS.ip_hash });
  return cols;
}

/**
 * Reconciles the stored column map with the current form definition.
 *  - Existing columns keep their position (historical data is never moved).
 *  - Columns for removed fields are KEPT, so old data is never destroyed.
 *  - New fields/metadata are appended as new columns at the end.
 *  - Non-custom headers follow the current field label; custom headers stick.
 */
export function reconcileColumns(existing: SheetColumn[], fields: FormField[], settings: FormSheetSettings): SheetColumn[] {
  const desired = desiredColumns(fields, settings);
  const desiredByKey = new Map(desired.map((c) => [c.key, c]));

  if (existing.length === 0) return desired;

  const result: SheetColumn[] = existing.map((col) => {
    const want = desiredByKey.get(col.key);
    if (want && !col.custom) return { ...col, header: want.header };
    return { ...col };
  });

  // The submission ID anchor is part of `desired`, so if it is missing it is
  // appended below (never inserted in front, which would shift existing data).
  const present = new Set(result.map((c) => c.key));
  for (const col of desired) if (!present.has(col.key)) result.push(col);
  return result;
}

/**
 * Builds a column map for a worksheet that already has a header row (e.g. the
 * admin reconnects a sheet used before). Existing headers are matched by text
 * and kept exactly in place; unknown headers are preserved as legacy columns,
 * so connecting never overwrites someone's existing data.
 */
export function adoptExistingHeaders(existingHeaders: string[], fields: FormField[], settings: FormSheetSettings): SheetColumn[] {
  const desired = desiredColumns(fields, settings);
  const remaining = [...desired];
  const result: SheetColumn[] = existingHeaders.map((header, i) => {
    const idx = remaining.findIndex((c) => c.header.trim().toLowerCase() === header.trim().toLowerCase());
    if (idx >= 0) {
      const [match] = remaining.splice(idx, 1);
      return { key: match!.key, header, custom: header !== match!.header };
    }
    return { key: `legacy:${i}`, header, custom: true };
  });
  // Trailing empty legacy headers are dropped so new columns fill the gap.
  while (result.length && result[result.length - 1]!.key.startsWith("legacy:") && !result[result.length - 1]!.header.trim()) {
    result.pop();
  }
  return reconcileColumns(result, fields, settings);
}

export function headersOf(columns: SheetColumn[]): string[] {
  return columns.map((c) => c.header);
}

export function headersHash(columns: SheetColumn[]): string {
  // Small, dependency-free stable hash (FNV-1a) — only used for change detection.
  const input = JSON.stringify(headersOf(columns));
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16) + `:${columns.length}`;
}

export interface SheetRowContext {
  submissionNumber: string;
  submittedAt: string;
  formName: string;
  branchName: string;
  userAgent?: string | null;
  ipHash?: string | null;
  timeZone: string;
  answers: Map<string, { field_type: string; value: string | null; value_json: unknown }>;
}

function formatSheetDate(iso: string, timeZone: string): string {
  // "2026-10-06 16:35:12" — sortable and recognisable by Sheets when typed manually
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function buildRow(columns: SheetColumn[], ctx: SheetRowContext): string[] {
  return columns.map((col) => {
    if (col.key.startsWith("field:")) {
      const answer = ctx.answers.get(col.key.slice(6));
      if (!answer) return "";
      return answer.value ?? answerToText(answer.field_type, answer.value_json);
    }
    switch (col.key) {
      case "meta:submission_id":
        return ctx.submissionNumber;
      case "meta:submitted_at":
        return formatSheetDate(ctx.submittedAt, ctx.timeZone);
      case "meta:form_name":
        return ctx.formName;
      case "meta:branch":
        return ctx.branchName;
      case "meta:user_agent":
        return ctx.userAgent ?? "";
      case "meta:ip_hash":
        return ctx.ipHash ?? "";
      default:
        return "";
    }
  });
}
