export type GoogleErrorKind = "auth" | "permission" | "not_found" | "rate_limit" | "transient" | "invalid" | "config";

export class GoogleApiError extends Error {
  constructor(
    message: string,
    public readonly kind: GoogleErrorKind,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }

  /** Whether automatic retries make sense. */
  get retryable(): boolean {
    return this.kind === "rate_limit" || this.kind === "transient";
  }
}

export function classifyGoogleStatus(status: number, reason?: string): GoogleErrorKind {
  if (status === 401) return "auth";
  if (status === 403) {
    if (reason && /rate|quota|userRateLimitExceeded/i.test(reason)) return "rate_limit";
    return "permission";
  }
  if (status === 404) return "not_found";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "transient";
  return "invalid";
}

/** Friendly explanation for admins (never includes tokens). */
export function describeGoogleError(err: unknown): string {
  if (err instanceof GoogleApiError) {
    switch (err.kind) {
      case "auth":
        return "Google Sheet connection requires reauthorization.";
      case "permission":
        return "The connected Google account no longer has edit access to this spreadsheet.";
      case "not_found":
        return "The spreadsheet or worksheet could not be found. It may have been deleted or renamed.";
      case "rate_limit":
        return "Google Sheets rate limit reached. The sync will be retried automatically.";
      case "transient":
        return "Google Sheets is temporarily unavailable. The sync will be retried automatically.";
      case "config":
        return err.message;
      default:
        return `Google Sheets rejected the request: ${err.message}`.slice(0, 300);
    }
  }
  return "Unexpected error while syncing to Google Sheets. It will be retried automatically.";
}
