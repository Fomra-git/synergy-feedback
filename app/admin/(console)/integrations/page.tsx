import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Mail, Sheet, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { isCaptchaConfigured, isEmailConfigured, isGoogleConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  const items = [
    {
      title: "Google Sheets",
      description: "Send every submission to a Google Sheet connected per form.",
      icon: Sheet,
      ok: isGoogleConfigured(),
      href: "/admin/integrations/google-sheets",
    },
    { title: "Email (Resend)", description: "Notify administrators about new submissions.", icon: Mail, ok: isEmailConfigured(), href: "/admin/settings" },
    { title: "Cloudflare Turnstile", description: "CAPTCHA protection for public forms.", icon: ShieldCheck, ok: isCaptchaConfigured(), href: "/admin/settings" },
  ];
  return (
    <>
      <PageHeader title="Integrations" description="Connected services. Credentials are configured as server environment variables." />
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((i) => (
          <Link key={i.title} href={i.href} className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-primary">
                    <i.icon className="size-5" aria-hidden />
                  </span>
                  {i.ok ? <Badge variant="success">Configured</Badge> : <Badge variant="warning">Not configured</Badge>}
                </div>
                <CardTitle className="pt-3">{i.title}</CardTitle>
                <CardDescription>{i.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Manage <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
