"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const MESSAGES: Record<string, [boolean, string]> = {
  connected: [true, "Google account connected."],
  denied: [false, "Google authorization was cancelled."],
  expired: [false, "Authorization session expired. Please try again."],
  invalid_state: [false, "Security check failed. Please try again."],
  missing_scope: [false, "Google Sheets access was not granted."],
  no_refresh_token: [false, "Google did not grant offline access. Remove the app from your Google account permissions and retry."],
  not_configured: [false, "Google OAuth is not configured on the server."],
  error: [false, "Could not connect to Google. Please try again."],
};

export function GoogleNoticeToast({ notice }: { notice: string | null }) {
  useEffect(() => {
    const m = notice ? MESSAGES[notice] : null;
    if (m) (m[0] ? toast.success : toast.error)(m[1]);
  }, [notice]);
  return null;
}
