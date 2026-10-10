import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdminPage } from "@/lib/auth/session";
import { env, isCaptchaConfigured, isEmailConfigured, isGoogleConfigured } from "@/lib/env";
import { googleScopes } from "@/lib/google/oauth";
import { getAppSettings } from "@/services/settings";
import { listBranchOptions } from "@/services/forms/admin";
import { AppSettingsForm } from "./app-settings-form";
import { ProfileForm } from "./team";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Settings" };

function Status({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <XCircle className="size-4 text-amber-600" aria-hidden />}
      <span>{label}</span>
      <span className="sr-only">{ok ? "configured" : "not configured"}</span>
    </li>
  );
}

export default async function SettingsPage() {
  const session = await requireAdminPage();
  const [settings, branches] = await Promise.all([getAppSettings(), listBranchOptions()]);

  return (
    <>
      <PageHeader title="Settings" description="Organisation, branding, email, integrations and security." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {session.isAdmin && <AppSettingsForm initial={settings} canEdit={session.isSuperAdmin} branches={branches} emailConfigured={isEmailConfigured()} />}
          {session.isAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Team</CardTitle>
                <CardDescription>Add admins and staff and set their branch and feature access.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline">
                  <Link href="/admin/users">Manage users</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Your profile</CardTitle>
              <CardDescription>{session.email}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProfileForm fullName={session.profile.full_name ?? ""} />
            </CardContent>
          </Card>
          {session.isAdmin && <Card>
            <CardHeader>
              <CardTitle>Server configuration</CardTitle>
              <CardDescription>Secrets are environment variables and never shown here.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2">
                <Status ok={isGoogleConfigured()} label="Google OAuth configured" />
                <Status ok={isEmailConfigured()} label="Resend email configured" />
                <Status ok={isCaptchaConfigured()} label="Turnstile CAPTCHA keys present" />
                <Status ok={Boolean(env.cronSecret())} label="Cron secret set (sync retries)" />
              </ul>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Google redirect URI</p>
                <p className="break-all">{env.googleRedirectUri()}</p>
                <p className="mt-2 font-medium text-foreground">Google scopes</p>
                <p className="break-all">{googleScopes().join(", ")}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Sessions</p>
                <p>Managed by Supabase Auth (httpOnly, Secure cookies). Configure JWT expiry and refresh-token rotation in Supabase → Authentication → Sessions.</p>
              </div>
            </CardContent>
          </Card>}
        </div>
      </div>
    </>
  );
}
