"use server";

import { z } from "zod";
import { requireAdminRole } from "@/lib/auth/session";
import { runAction, UserFacingError, type ActionResult } from "@/lib/actions";
import { isEmailConfigured } from "@/lib/env";
import { sendRatingReport } from "@/services/reports/monthly-email";
import type { ReportPeriod } from "@/lib/reports/rating";

const periodSchema = z.union([
  z.object({ kind: z.literal("day"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  z.object({ kind: z.literal("month"), month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) }),
]);

/** Emails the selected day's or month's report to "Recipients for all forms" right away. */
export async function emailReportNowAction(input: ReportPeriod): Promise<ActionResult> {
  return runAction(
    "emailReportNow",
    async () => {
      const session = await requireAdminRole();
      const period = periodSchema.parse(input);
      if (!isEmailConfigured()) throw new UserFacingError("Email isn't set up yet: add RESEND_API_KEY and EMAIL_FROM in Vercel.");
      const res = await sendRatingReport(period, { userId: session.userId });
      if (res.reason === "no_recipients") throw new UserFacingError("Add recipients under Settings → Email notifications → Recipients for all forms.");
      if (!res.sent) throw new UserFacingError("The email could not be sent. Please try again.");
      return undefined;
    },
    "Report emailed to the all-forms recipients",
  );
}
