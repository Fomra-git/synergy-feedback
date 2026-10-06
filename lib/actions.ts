import "server-only";
import { ZodError } from "zod";
import { AuthorizationError } from "@/lib/auth/session";
import { describeGoogleError, GoogleApiError } from "@/lib/google/errors";
import { logError } from "@/lib/logger";

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

export class UserFacingError extends Error {}

/**
 * Wraps a server action: converts known errors to friendly messages and logs
 * unexpected ones server-side. Internal details (SQL errors, stack traces,
 * tokens) never reach the browser.
 */
export async function runAction<T>(name: string, fn: () => Promise<T>, successMessage?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: successMessage };
  } catch (err) {
    if (err instanceof AuthorizationError) return { ok: false, error: err.message };
    if (err instanceof UserFacingError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of err.issues) {
        const key = issue.path.join(".");
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      return { ok: false, error: err.issues[0]?.message ?? "Please check the form for errors.", fieldErrors };
    }
    if (err instanceof GoogleApiError) {
      if (err.kind !== "config") logError(`action.${name}.google`, err);
      return { ok: false, error: describeGoogleError(err) };
    }
    // Postgres unique violation → friendly message
    if (typeof err === "object" && err && "code" in err && (err as { code: string }).code === "23505") {
      return { ok: false, error: "That value is already in use. Please choose another." };
    }
    logError(`action.${name}`, err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

/** Throws the Supabase error (kept server-side) if present. */
export function check<T>(result: { data: T; error: unknown }): NonNullable<T> {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
}
