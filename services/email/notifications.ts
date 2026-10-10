import "server-only";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/forms/format";
import { sendEmail } from "./resend";
import { MAX_NOTIFICATION_RECIPIENTS } from "@/lib/email/recipients";

export interface SubmissionNotification {
  recipients: string[];
  formName: string;
  branchName: string | null;
  submissionId: string;
  submissionNumber: string;
  submittedAt: string;
  subjectTemplate?: string;
  senderName?: string;
  brandColor?: string;
  /** Only included when the form explicitly enables it (privacy default: off). */
  answers?: { label: string; value: string }[];
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderSubject(template: string | undefined, vars: { form: string; branch: string; number: string }): string {
  const base = template?.trim() || "New {form} Submission – {branch}";
  return base
    .replace(/\{form\}/g, vars.form)
    .replace(/\{branch\}/g, vars.branch || "All branches")
    .replace(/\{number\}/g, vars.number)
    .replace(/\s+–\s*$/, "")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 200);
}

export function buildSubmissionEmail(n: SubmissionNotification) {
  const timeZone = env.timezone();
  const submitted = formatDateTime(n.submittedAt, timeZone);
  const url = `${env.appUrl()}/admin/submissions/${n.submissionId}`;
  const color = /^#[0-9a-f]{6}$/i.test(n.brandColor ?? "") ? n.brandColor! : "#0f766e";
  const subject = renderSubject(n.subjectTemplate, { form: n.formName, branch: n.branchName ?? "", number: n.submissionNumber });

  const rows: [string, string][] = [
    ["Form", n.formName],
    ["Branch", n.branchName || "—"],
    ["Submission ID", n.submissionNumber],
    ["Submitted", submitted],
  ];

  const tableRows = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:130px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:#0f172a;font-size:14px;font-weight:600">${escapeHtml(v)}</td></tr>`,
    )
    .join("");

  const answersHtml = n.answers?.length
    ? `<h3 style="margin:24px 0 8px;font-size:14px;color:#0f172a">Responses</h3><table style="width:100%;border-collapse:collapse">${n.answers
        .map(
          (a) =>
            `<tr><td style="padding:6px 0;border-top:1px solid #e2e8f0;color:#64748b;font-size:13px;width:40%;vertical-align:top">${escapeHtml(a.label)}</td><td style="padding:6px 0;border-top:1px solid #e2e8f0;color:#0f172a;font-size:14px;white-space:pre-wrap">${escapeHtml(a.value)}</td></tr>`,
        )
        .join("")}</table>`
    : "";

  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
<tr><td style="background:${color};padding:20px 28px;color:#ffffff;font-size:16px;font-weight:700">Synergy Feedback</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 4px;font-size:20px;color:#0f172a">New submission received</h1>
<p style="margin:0 0 20px;color:#475569;font-size:14px">A new response was submitted to <strong>${escapeHtml(n.formName)}</strong>.</p>
<table style="width:100%;border-collapse:collapse">${tableRows}</table>
${answersHtml}
<p style="margin:28px 0 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600;font-size:14px">View Submission</a></p>
</td></tr>
<tr><td style="padding:16px 28px;background:#f8fafc;color:#94a3b8;font-size:12px">You receive this email because you are listed as a notification recipient for this form.</td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "New submission received.",
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(n.answers?.length ? ["", "Responses:", ...n.answers.map((a) => `${a.label}: ${a.value}`)] : []),
    "",
    `View Submission: ${url}`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Notifies administrators about a new public submission. By default the email
 * contains no patient answers (health data) — only form, branch and ID.
 */
export async function sendSubmissionNotification(n: SubmissionNotification): Promise<boolean> {
  const recipients = Array.from(new Set(n.recipients.map((r) => r.trim().toLowerCase()).filter(Boolean))).slice(0, MAX_NOTIFICATION_RECIPIENTS);
  if (!recipients.length) return false;
  const { subject, html, text } = buildSubmissionEmail(n);
  return sendEmail({
    to: recipients,
    subject,
    html,
    text,
    fromName: n.senderName,
    idempotencyKey: `submission-${n.submissionId}`,
  });
}
