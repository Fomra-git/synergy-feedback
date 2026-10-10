/** Resend accepts at most 50 addresses in `to`. */
export const MAX_NOTIFICATION_RECIPIENTS = 50;

/**
 * Who is emailed about a new submission: everyone on the "all forms" list,
 * plus the submission's branch list, plus the form's own list — de-duplicated.
 * A form with notifications switched off emails nobody.
 */
export function resolveNotificationRecipients(input: {
  formEnabled: boolean | undefined;
  formRecipients: string[] | undefined;
  allForms: string[];
  branchRecipients: Record<string, string[]>;
  branchId: string | null | undefined;
}): string[] {
  if (input.formEnabled === false) return [];
  const all = [
    ...input.allForms,
    ...(input.branchId ? (input.branchRecipients[input.branchId] ?? []) : []),
    ...(input.formRecipients ?? []),
  ];
  return Array.from(new Set(all.map((r) => r.trim().toLowerCase()).filter(Boolean))).slice(0, MAX_NOTIFICATION_RECIPIENTS);
}
