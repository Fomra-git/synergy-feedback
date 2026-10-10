import { NextResponse, type NextRequest } from "next/server";
import { getAdminSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { csvRow, storedAnswerText } from "@/lib/forms/format";
import { isInputType } from "@/lib/forms/field-registry";
import { logAudit } from "@/lib/audit";
import { logError } from "@/lib/logger";
import { applySubmissionFilters, parseSubmissionFilters, syncEmbed } from "@/services/submissions/query";
import type { FormFieldRow } from "@/types/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BATCH = 500;
const MAX_ROWS = 200_000;

interface ExportRow {
  id: string;
  submission_number: string;
  submitted_at: string;
  forms: { name: string } | null;
  branches: { name: string } | null;
  submission_answers: { field_id: string; field_type: string; field_label: string; value: string | null; value_json: unknown }[];
  google_sheet_sync_logs: { status: string } | { status: string }[] | null;
}

/**
 * Server-side streaming CSV export. Runs with the admin's RLS-scoped client,
 * respects all list filters, and pages through results in batches so huge
 * datasets are never loaded into memory or the browser.
 */
export async function GET(request: NextRequest) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!session.can("submissions.export")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseSubmissionFilters(sp);
  const excel = sp.format === "excel";
  const timeZone = env.timezone();
  const supabase = await createClient();

  // Column layout: the filtered form's fields, or the union (by label) of all accessible forms' fields.
  let fieldQuery = supabase.from("form_fields").select("form_id, field_id, type, label, position").order("position");
  if (filters.form) fieldQuery = fieldQuery.eq("form_id", filters.form);
  const { data: fieldRows, error: fieldErr } = await fieldQuery.returns<Pick<FormFieldRow, "form_id" | "field_id" | "type" | "label" | "position">[]>();
  if (fieldErr) {
    logError("export.fields_failed", fieldErr);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
  const columns: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const f of fieldRows ?? []) {
    if (!isInputType(f.type)) continue;
    const key = filters.form ? f.field_id : (f.label || f.field_id).trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    columns.push({ key, label: f.label || f.field_id });
  }

  const header = ["Submission ID", "Submitted At", "Form", "Branch", ...columns.map((c) => c.label), "Google Sheet Sync"];
  const dateFmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const encoder = new TextEncoder();
  let exported = 0;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (excel) controller.enqueue(encoder.encode("﻿"));
        controller.enqueue(encoder.encode(csvRow(header)));

        let cursor: { at: string; id: string } | null = null;
        while (exported < MAX_ROWS) {
          let q = supabase
            .from("form_submissions")
            .select(
              `id, submission_number, submitted_at, forms(name), branches(name), submission_answers(field_id, field_type, field_label, value, value_json), ${syncEmbed(filters, "status")}`,
            )
            .order("submitted_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(BATCH);
          q = applySubmissionFilters(q, filters, timeZone);
          if (cursor) q = q.or(`submitted_at.lt."${cursor.at}",and(submitted_at.eq."${cursor.at}",id.lt.${cursor.id})`);
          const { data, error } = await q.returns<ExportRow[]>();
          if (error) throw error;
          if (!data?.length) break;

          let chunk = "";
          for (const s of data) {
            const answers = new Map<string, string>();
            for (const a of s.submission_answers ?? []) {
              const key = filters.form ? a.field_id : (a.field_label || a.field_id).trim().toLowerCase();
              answers.set(key, storedAnswerText(a));
            }
            const sync = Array.isArray(s.google_sheet_sync_logs) ? s.google_sheet_sync_logs[0] : s.google_sheet_sync_logs;
            chunk += csvRow([
              s.submission_number,
              dateFmt.format(new Date(s.submitted_at)).replace(",", ""),
              s.forms?.name ?? "",
              s.branches?.name ?? "",
              ...columns.map((c) => answers.get(c.key) ?? ""),
              sync?.status ?? "not connected",
            ]);
          }
          controller.enqueue(encoder.encode(chunk));
          exported += data.length;
          const last = data[data.length - 1]!;
          cursor = { at: last.submitted_at, id: last.id };
          if (data.length < BATCH) break;
        }
        controller.close();
        await logAudit({
          userId: session.userId,
          action: "submissions.exported",
          entityType: "submission",
          metadata: { rows: exported, filters, format: excel ? "excel" : "csv" },
        });
      } catch (err) {
        logError("export.stream_failed", err);
        controller.error(err);
      }
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="synergy-submissions-${stamp}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
