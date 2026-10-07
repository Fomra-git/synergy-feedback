import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_APP_SETTINGS, type AppSettings } from "@/schemas/settings";
import { logError } from "@/lib/logger";

/** Organisation settings (singleton). Read server-side only. */
export const getAppSettings = cache(async (): Promise<AppSettings> => {
  try {
    const { data, error } = await createAdminClient()
      .from("app_settings")
      .select("organization, branding, email, security, timezone")
      .eq("id", 1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return DEFAULT_APP_SETTINGS;
    return {
      organization: { ...DEFAULT_APP_SETTINGS.organization, ...(data.organization ?? {}) },
      branding: {
        ...DEFAULT_APP_SETTINGS.branding,
        ...(data.branding ?? {}),
        formDefaults: { ...DEFAULT_APP_SETTINGS.branding.formDefaults, ...(data.branding?.formDefaults ?? {}) },
      },
      email: { ...DEFAULT_APP_SETTINGS.email, ...(data.email ?? {}) },
      security: { ...DEFAULT_APP_SETTINGS.security, ...(data.security ?? {}) },
      timezone: data.timezone ?? DEFAULT_APP_SETTINGS.timezone,
    };
  } catch (err) {
    logError("settings.load_failed", err);
    return DEFAULT_APP_SETTINGS;
  }
});
