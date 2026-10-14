import "server-only";
import { env } from "@/lib/env";
import { logAudit } from "@/lib/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { escapeHtml } from "@/services/email/notifications";
import { sendEmail } from "@/services/email/resend";
import { getAppSettings } from "@/services/settings";
import { ratingReportCsv } from "@/lib/reports/csv";
import { formatAverage, markColor, monthLabel, type RatingReport } from "@/lib/reports/rating";
import { loadRatingData, reportFor } from "./rating";

const cell = "padding:6px 8px;border-top:1px solid #e2e8f0;font-size:13px;color:#0f172a";
const head = "padding:6px 8px;font-size:12px;color:#64748b;text-align:left;font-weight:600";

/** Email-safe horizontal bar (tables + inline styles, no SVG). */
function bar(pct: number, color: string) {
  const w = Math.max(0, Math.min(100, Math.round(pct)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="background:#f1f5f9;border-radius:4px;height:10px"><div style="width:${w}%;background:${color};height:10px;border-radius:4px"></div></td></tr></table>`;
}

function marksTable(r: RatingReport) {
  const total = r.ratings || 1;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${r.marks
    .map(
      (m) =>
        `<tr><td style="${cell};width:70px;font-weight:600">Mark ${m.score}</td><td style="${cell}">${bar((m.count / total) * 100, markColor(m.score, r.maxScore))}</td><td style="${cell};width:110px;text-align:right">${m.count} (${Math.round((m.count / total) * 100)}%)</td></tr>`,
    )
    .join("")}</table>`;
}

function questionsTable(r: RatingReport) {
  if (!r.questions.length) return `<p style="color:#64748b;font-size:13px">No rating answers in this period.</p>`;
  const cols = r.marks.map((m) => m.score);
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${head}">Question</th><th style="${head};text-align:right">Avg</th>${cols
    .map((c) => `<th style="${head};text-align:right">${c}</th>`)
    .join("")}<th style="${head};text-align:right">Customers</th></tr>${r.questions
    .map(
      (q) =>
        `<tr><td style="${cell}">${escapeHtml(q.question)}</td><td style="${cell};text-align:right;font-weight:600">${formatAverage(q.average)}</td>${cols
          .map((c) => `<td style="${cell};text-align:right">${q.marks.find((m) => m.score === c)?.count ?? 0}</td>`)
          .join("")}<td style="${cell};text-align:right">${q.customers}</td></tr>`,
    )
    .join("")}</table>`;
}

function summary(r: RatingReport) {
  const tile = (label: string, value: string) =>
    `<td style="padding:12px;border:1px solid #e2e8f0;border-radius:8px;width:33%"><div style="font-size:12px;color:#64748b">${label}</div><div style="font-size:22px;font-weight:700;color:#0f172a;margin-top:2px">${value}</div></td>`;
  return `<table width="100%" cellpadding="0" cellspacing="6" style="border-collapse:separate"><tr>${tile("Average mark", `${formatAverage(r.average)} <span style="font-size:13px;color:#64748b">/ ${r.maxScore}</span>`)}${tile("Ratings given", String(r.ratings))}${tile("Customers", String(r.customers))}</tr></table>`;
}

function branchTable(r: RatingReport) {
  const max = r.maxScore || 5;
  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><th style="${head}">Branch</th><th style="${head}"></th><th style="${head};text-align:right">Avg</th><th style="${head};text-align:right">Customers</th></tr>${r.branches
    .map(
      (b) =>
        `<tr><td style="${cell};font-weight:600">${escapeHtml(b.name)}</td><td style="${cell};width:45%">${bar(((b.average ?? 0) / max) * 100, "#1d5fb6")}</td><td style="${cell};text-align:right">${formatAverage(b.average)}</td><td style="${cell};text-align:right">${b.customers}</td></tr>`,
    )
    .join("")}</table>`;
}

export interface MonthlyReportEmail {
  subject: string;
  html: string;
  text: string;
  csv: string;
}

export function buildMonthlyReportEmail(month: string, orgName: string, all: RatingReport, branches: { name: string; report: RatingReport }[]): MonthlyReportEmail {
  const label = monthLabel(month);
  const url = `${env.appUrl()}/admin/reports?month=${month}`;
  const section = (title: string, body: string) => `<h2 style="margin:28px 0 10px;font-size:16px;color:#0f172a">${title}</h2>${body}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:#02334c;padding:20px 28px;color:#ffffff"><div style="font-size:13px;opacity:.8">${escapeHtml(orgName)} · Synergy Feedback</div><div style="font-size:20px;font-weight:700;margin-top:4px">Monthly feedback report — ${label}</div></td></tr>
<tr><td style="padding:8px 28px 28px">
${section("All branches", summary(all) + `<div style="margin-top:12px">${marksTable(all)}</div>`)}
${all.branches.length > 1 ? section("Average by branch", branchTable(all)) : ""}
${section("Question-wise marks — all branches", questionsTable(all))}
${branches
  .map((b) => section(`${escapeHtml(b.name)}`, summary(b.report) + `<div style="margin-top:12px">${questionsTable(b.report)}</div>`))
  .join("")}
<p style="margin:28px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#02334c;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">Open report with charts</a></p>
<p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Marks come from radio questions whose options are numbers (for example 5, 4, 3, 2, 1). The attached CSV has the same figures.</p>
</td></tr></table></td></tr></table></body></html>`;

  const text = [
    `Monthly feedback report — ${label}`,
    "",
    `All branches: average ${formatAverage(all.average)} / ${all.maxScore}, ${all.ratings} ratings from ${all.customers} customers`,
    ...all.marks.map((m) => `  Mark ${m.score}: ${m.count}`),
    "",
    ...all.branches.map((b) => `${b.name}: average ${formatAverage(b.average)}, ${b.customers} customers`),
    "",
    `Open the report: ${url}`,
  ].join("\n");

  return {
    subject: `${orgName} feedback report — ${label}`,
    html,
    text,
    csv: ratingReportCsv(month, [{ name: "All branches", report: all }, ...branches]),
  };
}

/**
 * Builds the report for `month` across all branches (service role) and emails
 * it to the "Recipients for all forms" list. Returns what happened.
 */
export async function sendMonthlyReport(month: string, opts: { idempotencyKey?: string; userId?: string | null } = {}) {
  const settings = await getAppSettings();
  const recipients = settings.email.defaultRecipients;
  if (!recipients.length) return { sent: false, reason: "no_recipients" as const };

  const data = await loadRatingData(createAdminClient(), month, env.timezone());
  const all = reportFor(data);
  const branches = all.branches.map((b) => ({ name: b.name, report: reportFor(data, b.id) }));
  const email = buildMonthlyReportEmail(month, settings.organization.name || "Synergy Wellness", all, branches);
  const sent = await sendEmail({
    to: recipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
    fromName: settings.email.senderName,
    idempotencyKey: opts.idempotencyKey,
    attachments: [{ filename: `feedback-report-${month}.csv`, content: email.csv, contentType: "text/csv" }],
  });
  if (sent) {
    await logAudit({
      userId: opts.userId ?? null,
      action: "report.monthly_sent",
      entityType: "report",
      metadata: { month, recipients: recipients.length, ratings: all.ratings, manual: Boolean(opts.userId) },
    });
  }
  return { sent, reason: sent ? null : ("send_failed" as const) };
}
