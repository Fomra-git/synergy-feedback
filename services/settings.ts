import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/schemas/settings";
import { logError } from "@/lib/logger";

/** Cache tag for the settings row; saving settings expires it immediately. */
export const APP_SETTINGS_TAG = "app-settings";

/**
 * Settings change rarely but are read on almost every request, so they are
 * kept in Next's data cache (shared across requests). Saving in the console
 * calls updateTag(APP_SETTINGS_TAG); the 5-minute expiry also picks up edits
 * made directly in the database. Errors are thrown (not cached) so a failed
 * read is retried on the next request.
 */
const loadAppSettings = unstable_cache(
  async () => {
    const { data, error } = await createAdminClient()
      .from("app_settings")
      .select("organization, branding, email, security, timezone")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },
  ["app-settings-v1"],
  { tags: [APP_SETTINGS_TAG], revalidate: 300 },
);

/** Organisation settings (singleton). Read server-side only. */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    const data = await loadAppSettings();
    if (!data) return DEFAULT_APP_SETTINGS;
    return {
      organization: { ...DEFAULT_APP_SETTINGS.organization, ...(data.organization ?? {}) },
      branding: {
        ...DEFAULT_APP_SETTINGS.branding,
        ...(data.branding ?? {}),
        formDefaults: { ...DEFAULT_APP_SETTINGS.branding.formDefaults, ...(data.branding?.formDefaults ?? {}) },
      },
      email: {
        ...DEFAULT_APP_SETTINGS.email,
        ...(data.email ?? {}),
        branchRecipients: { ...(data.email?.branchRecipients ?? {}) },
      },
      security: { ...DEFAULT_APP_SETTINGS.security, ...(data.security ?? {}) },
      timezone: data.timezone ?? DEFAULT_APP_SETTINGS.timezone,
    };
  } catch (err) {
    logError("settings.load_failed", err);
    return DEFAULT_APP_SETTINGS;
  }
});
