import "server-only";
import { getAppSettings } from "@/services/settings";
import { env } from "@/lib/env";

export const LEGAL_LAST_UPDATED = "7 October 2026";

/** Organisation details shown on public legal pages (from Settings → Organization). */
export async function getLegalContext() {
  const s = await getAppSettings();
  return {
    orgName: s.organization.name || "Synergy Wellness",
    contactEmail: s.organization.email || s.email.senderEmail || "",
    website: s.organization.website || "",
    appUrl: env.appUrl(),
  };
}
