"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { readableTextColor } from "@/lib/utils";
import type { AppSettings } from "@/schemas/settings";
import { saveAppSettingsAction, uploadLogoAction } from "./actions";

function F({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const parseEmails = (v: string) => Array.from(new Set(v.split(/[,;\s]+/).map((r) => r.trim().toLowerCase()).filter(Boolean)));

export function AppSettingsForm({
  initial,
  canEdit,
  branches,
  emailConfigured,
}: {
  initial: AppSettings;
  canEdit: boolean;
  branches: { id: string; name: string; status: string }[];
  emailConfigured: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(initial);
  const [recipients, setRecipients] = useState(initial.email.defaultRecipients.join(", "));
  const [branchDrafts, setBranchDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(branches.map((b) => [b.id, (initial.email.branchRecipients[b.id] ?? []).join(", ")])),
  );
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const dis = !canEdit;
  const fd = s.branding.formDefaults;
  const setFd = (patch: Partial<typeof fd>) =>
    setS((prev) => ({ ...prev, branding: { ...prev.branding, formDefaults: { ...prev.branding.formDefaults, ...patch } } }));

  const save = () =>
    start(async () => {
      const res = await saveAppSettingsAction({
        ...s,
        email: {
          ...s.email,
          defaultRecipients: parseEmails(recipients),
          branchRecipients: Object.fromEntries(
            Object.entries(branchDrafts)
              .map(([id, v]) => [id, parseEmails(v)] as const)
              .filter(([, list]) => list.length > 0),
          ),
        },
      });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else toast.error(res.error);
    });

  return (
    <>
      {!canEdit && <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">Only a super admin can change organisation settings.</p>}
      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F id="org-name" label="Company Name">
            <Input id="org-name" disabled={dis} value={s.organization.name} onChange={(e) => setS({ ...s, organization: { ...s.organization, name: e.target.value } })} />
          </F>
          <F id="org-email" label="Email">
            <Input id="org-email" type="email" disabled={dis} value={s.organization.email} onChange={(e) => setS({ ...s, organization: { ...s.organization, email: e.target.value } })} />
          </F>
          <F id="org-web" label="Website">
            <Input id="org-web" disabled={dis} value={s.organization.website} placeholder="https://" onChange={(e) => setS({ ...s, organization: { ...s.organization, website: e.target.value } })} />
          </F>
          <F id="org-tz" label="Timezone" hint="IANA name, e.g. Asia/Kolkata. Statistics also use the APP_TIMEZONE env variable.">
            <Input id="org-tz" disabled={dis} value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })} />
          </F>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Default logo and colours for public forms.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            {s.branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- uploaded logo preview
              <img src={s.branding.logoUrl} alt="Organisation logo" className="h-12 w-auto rounded border bg-white p-1" />
            ) : (
              <span className="text-sm text-muted-foreground">No logo uploaded</span>
            )}
            {canEdit && (
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted">
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload logo
                <input
                  type="file"
                  className="sr-only"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploading(true);
                    const fd = new FormData();
                    fd.set("file", file);
                    const res = await uploadLogoAction(fd);
                    setUploading(false);
                    if (res.ok) setS((p) => ({ ...p, branding: { ...p.branding, logoUrl: res.data.url } }));
                    else toast.error(res.error);
                  }}
                />
              </label>
            )}
            {canEdit && s.branding.logoUrl && (
              <Button variant="ghost" size="sm" onClick={() => setS({ ...s, branding: { ...s.branding, logoUrl: "" } })}><X /> Remove</Button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {(["primaryColor", "secondaryColor"] as const).map((k) => (
              <F key={k} id={`br-${k}`} label={k === "primaryColor" ? "Primary Color" : "Secondary Color"}>
                <div className="flex gap-2">
                  <input type="color" aria-label={`${k} picker`} disabled={dis} value={s.branding[k]} onChange={(e) => setS({ ...s, branding: { ...s.branding, [k]: e.target.value } })} className="h-10 w-12 rounded-md border p-1" />
                  <Input id={`br-${k}`} disabled={dis} className="font-mono" value={s.branding[k]} onChange={(e) => setS({ ...s, branding: { ...s.branding, [k]: e.target.value } })} />
                </div>
              </F>
            ))}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Global form appearance</CardTitle>
          <CardDescription>
            Used by every form that has <strong>Apply global settings</strong> turned on (Form → Settings → Appearance). Turn it off on a form to customise that form separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {([
              ["headerColor", "Header color"],
              ["primaryColor", "Primary color"],
              ["backgroundColor", "Background"],
              ["buttonColor", "Button color"],
            ] as const).map(([k, label]) => (
              <F key={k} id={`fd-${k}`} label={label}>
                <div className="flex gap-2">
                  <input type="color" aria-label={`${label} picker`} disabled={dis} value={fd[k]} onChange={(e) => setFd({ [k]: e.target.value })} className="h-10 w-12 rounded-md border p-1" />
                  <Input id={`fd-${k}`} disabled={dis} className="font-mono" maxLength={7} value={fd[k]} onChange={(e) => setFd({ [k]: e.target.value })} />
                </div>
              </F>
            ))}
          </div>
          <F id="fd-font" label="Font">
            <NativeSelect id="fd-font" disabled={dis} value={fd.font} onChange={(e) => setFd({ font: e.target.value as typeof fd.font })}>
              <option value="inter">Inter (modern)</option>
              <option value="rounded">Nunito (friendly)</option>
              <option value="serif">Lora (classic)</option>
              <option value="system">System default</option>
            </NativeSelect>
          </F>
          <F id="fd-title" label="Form title (optional)" hint="If set, replaces each form's own title. Leave empty to keep each form's name.">
            <Input id="fd-title" disabled={dis} maxLength={150} value={fd.title} placeholder="e.g. Synergy Wellness Feedback" onChange={(e) => setFd({ title: e.target.value })} />
          </F>
          <F id="fd-desc" label="Form description (optional)" hint="If set, replaces each form's own description.">
            <Textarea id="fd-desc" disabled={dis} rows={3} maxLength={2000} value={fd.description} placeholder="e.g. Your feedback helps us improve our physiotherapy services." onChange={(e) => setFd({ description: e.target.value })} />
          </F>
          <div className="rounded-xl border p-5" style={{ background: fd.backgroundColor }}>
            <div className="mx-auto max-w-sm overflow-hidden rounded-lg bg-white shadow-sm">
              <div className="px-5 py-5 text-center font-heading" style={{ background: fd.headerColor, color: readableTextColor(fd.headerColor) }}>
                <p className="text-lg font-bold">{fd.title || "Form name"}</p>
                <p className="mt-1 text-sm opacity-90">{fd.description || "Form description"}</p>
              </div>
              <div className="p-5">
                <div className="h-9 rounded-md border" />
                <div className="mt-4 inline-block rounded-md px-4 py-2 text-sm font-semibold" style={{ background: fd.buttonColor, color: readableTextColor(fd.buttonColor) }}>
                  Submit
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>
            Who is emailed when someone submits a form. Everyone below for the matching scope is notified (duplicates are sent once). Add form-specific recipients in Form → Settings → Notifications.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <F id="em-name" label="Sender Name">
            <Input id="em-name" disabled={dis} value={s.email.senderName} onChange={(e) => setS({ ...s, email: { ...s.email, senderName: e.target.value } })} />
          </F>
          <F id="em-email" label="Sender Email (reply-to reference)">
            <Input id="em-email" type="email" disabled={dis} value={s.email.senderEmail} onChange={(e) => setS({ ...s, email: { ...s.email, senderEmail: e.target.value } })} />
          </F>
          {!emailConfigured && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:col-span-2">
              Email sending is not set up yet: add RESEND_API_KEY and EMAIL_FROM in your Vercel environment variables, then redeploy.
            </p>
          )}
          <div className="sm:col-span-2">
            <F id="em-rec" label="Recipients for all forms" hint="Comma separated. Emailed about every submission on every form.">
              <Input id="em-rec" disabled={dis} value={recipients} placeholder="manager@synergywellness.in" onChange={(e) => setRecipients(e.target.value)} />
            </F>
          </div>
          <div className="space-y-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Recipients by branch</p>
              <p className="text-xs text-muted-foreground">Comma separated. Emailed about submissions for that branch only (any form).</p>
            </div>
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No branches yet.</p>
            ) : (
              <div className="divide-y rounded-lg border">
                {branches.map((b) => (
                  <div key={b.id} className="grid gap-2 p-3 sm:grid-cols-[180px_1fr] sm:items-center">
                    <Label htmlFor={`br-${b.id}`} className="flex items-center gap-2">
                      {b.name}
                      {b.status !== "active" && <span className="text-xs font-normal text-muted-foreground">(inactive)</span>}
                    </Label>
                    <Input
                      id={`br-${b.id}`}
                      disabled={dis}
                      value={branchDrafts[b.id] ?? ""}
                      placeholder="branch.manager@synergywellness.in"
                      onChange={(e) => setBranchDrafts((d) => ({ ...d, [b.id]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>Public submission protection.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label htmlFor="sec-captcha">CAPTCHA (Cloudflare Turnstile)</Label>
              <p className="mt-1 text-sm text-muted-foreground">Requires NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY.</p>
            </div>
            <Switch id="sec-captcha" disabled={dis} checked={s.security.captchaEnabled} onCheckedChange={(v) => setS({ ...s, security: { ...s.security, captchaEnabled: v } })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <F id="rl-m" label="Submissions per minute (per device/IP)">
              <Input id="rl-m" type="number" min={1} disabled={dis} value={s.security.submissionRateLimitPerMinute} onChange={(e) => setS({ ...s, security: { ...s.security, submissionRateLimitPerMinute: Number(e.target.value) } })} />
            </F>
            <F id="rl-h" label="Submissions per hour (per device/IP)" hint="Clinics sharing one Wi-Fi tablet may need a higher limit.">
              <Input id="rl-h" type="number" min={1} disabled={dis} value={s.security.submissionRateLimitPerHour} onChange={(e) => setS({ ...s, security: { ...s.security, submissionRateLimitPerHour: Number(e.target.value) } })} />
            </F>
          </div>
        </CardContent>
      </Card>
      {canEdit && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save settings
          </Button>
        </div>
      )}
    </>
  );
}
