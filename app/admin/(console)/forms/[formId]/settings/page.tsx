import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormForAdmin } from "@/services/forms/admin";
import { getColumnPreview } from "@/services/google-sheets/connections";
import { createClient } from "@/lib/supabase/server";
import { env, isGoogleConfigured } from "@/lib/env";
import { FormSettingsTabs } from "./settings-tabs";
import type { SyncStatus } from "@/types/db";

export const metadata: Metadata = { title: "Form Settings" };

const TABS = ["general", "submission", "notifications", "integrations", "appearance", "behavior"] as const;

export default async function FormSettingsPage(props: PageProps<"/admin/forms/[formId]/settings">) {
  const { formId } = await props.params;
  const sp = await props.searchParams;
  const data = await getFormForAdmin(formId);
  if (!data) notFound();

  const supabase = await createClient();
  const [{ data: accounts }, { data: logs }, columns] = await Promise.all([
    supabase.rpc("list_google_accounts"),
    supabase.from("google_sheet_sync_logs").select("status").eq("form_id", formId),
    getColumnPreview(formId),
  ]);
  const syncCounts: Record<SyncStatus, number> = { pending: 0, processing: 0, synced: 0, failed: 0, skipped: 0 };
  for (const l of (logs ?? []) as { status: SyncStatus }[]) syncCounts[l.status]++;

  const tabParam = typeof sp.tab === "string" ? sp.tab : "general";
  const tab = (TABS as readonly string[]).includes(tabParam) ? tabParam : "general";

  return (
    <FormSettingsTabs
      initialTab={tab}
      googleNotice={typeof sp.google === "string" ? sp.google : null}
      form={{ id: data.form.id, name: data.form.name, slug: data.form.slug, settings: data.form.settings ?? {} }}
      privateSettings={{
        submission: { allowSubmissions: true, duplicateProtection: true, ...(data.settings?.submission ?? {}) },
        notifications: { enabled: true, recipients: [], includeAnswers: false, ...(data.settings?.notifications ?? {}) },
        google_sheets: { includeFormName: true, includeBranch: true, includeUserAgent: false, includeIpHash: false, ...(data.settings?.google_sheets ?? {}) },
      }}
      google={{
        configured: isGoogleConfigured(),
        driveListing: env.googleDriveListing(),
        connection: data.connection,
        accounts: ((accounts ?? []) as { id: string; email: string; status: string }[]).map((a) => ({ id: a.id, email: a.email, status: a.status })),
        columns,
        syncCounts,
        timeZone: env.timezone(),
      }}
    />
  );
}
