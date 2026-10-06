import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, Plug, Sheet } from "lucide-react";
import { PageHeader } from "@/components/admin/page-header";
import { EmptyState } from "@/components/admin/empty-state";
import { SheetStatusBadge } from "@/components/admin/status-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireAdminPage } from "@/lib/auth/session";
import { env, isGoogleConfigured } from "@/lib/env";
import { googleScopes } from "@/lib/google/oauth";
import { formatDateTime } from "@/lib/forms/format";
import type { SheetConnectionRow } from "@/types/db";
import { RemoveAccountButton } from "./remove-account-button";
import { GoogleNoticeToast } from "./notice";

export const metadata: Metadata = { title: "Google Sheets" };

export default async function GoogleSheetsIntegrationPage(props: PageProps<"/admin/integrations/google-sheets">) {
  const session = await requireAdminPage();
  const sp = await props.searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, { data: connections }] = await Promise.all([
    supabase.rpc("list_google_accounts"),
    supabase
      .from("google_sheet_connections")
      .select("*, forms(id, name)")
      .neq("status", "disconnected")
      .order("updated_at", { ascending: false }),
  ]);
  const accs = (accounts ?? []) as { id: string; email: string; status: string; connection_count: number; created_at: string; scopes: string[] }[];
  const conns = (connections ?? []) as (SheetConnectionRow & { forms: { id: string; name: string } | null })[];
  const tz = env.timezone();
  const configured = isGoogleConfigured();

  return (
    <>
      <GoogleNoticeToast notice={typeof sp.google === "string" ? sp.google : null} />
      <PageHeader
        title="Google Sheets"
        description="Each form connects to its own spreadsheet. Configure the connection inside each form's settings."
        actions={
          configured ? (
            <Button asChild variant="outline">
              <a href="/api/google/oauth/start?returnTo=/admin/integrations/google-sheets"><Plug /> Connect Google account</a>
            </Button>
          ) : null
        }
      />
      {!configured && (
        <div role="alert" className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="size-5 shrink-0" aria-hidden />
          <p>Google OAuth is not configured. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI and TOKEN_ENCRYPTION_KEY to the server environment (README → Google Cloud Setup).</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Connected Google accounts</CardTitle>
            <CardDescription>Tokens are AES-256-GCM encrypted at rest and never sent to browsers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {accs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No Google account connected yet.</p>
            ) : (
              accs.map((a) => (
                <div key={a.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium break-all">{a.email}</p>
                    {a.status === "connected" ? <Badge variant="success">Connected</Badge> : <Badge variant="destructive">Reauthorize</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.connection_count} form{a.connection_count === 1 ? "" : "s"} · since {formatDateTime(a.created_at, tz)}</p>
                  <div className="mt-2 flex gap-2">
                    {a.status !== "connected" && (
                      <Button asChild size="sm" variant="destructive">
                        <a href={`/api/google/oauth/start?returnTo=/admin/integrations/google-sheets&hint=${encodeURIComponent(a.email)}`}>Reauthorize</a>
                      </Button>
                    )}
                    {session.isSuperAdmin && <RemoveAccountButton id={a.id} email={a.email} />}
                  </div>
                </div>
              ))
            )}
            <div className="border-t pt-3 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Requested scopes</p>
              <ul className="mt-1 list-disc pl-4">
                {googleScopes().map((s) => (
                  <li key={s} className="break-all">{s.replace("https://www.googleapis.com/auth/", "")}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Connected forms</CardTitle>
          </CardHeader>
          <CardContent className="px-0 sm:px-0">
            {conns.length === 0 ? (
              <EmptyState icon={Sheet} title="No forms connected" description="Open a form's Settings → Integrations to connect a Google Sheet." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Form</TableHead>
                    <TableHead>Spreadsheet</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Last sync</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conns.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Link href={`/admin/forms/${c.form_id}/settings?tab=integrations`} className="font-medium hover:underline">{c.forms?.name ?? "Form"}</Link>
                        <p className="text-xs break-all text-muted-foreground">{c.google_account_email}</p>
                      </TableCell>
                      <TableCell>
                        {c.spreadsheet_url ? (
                          <a href={c.spreadsheet_url} target="_blank" rel="noreferrer" className="hover:underline">{c.spreadsheet_name}</a>
                        ) : (
                          <span className="text-muted-foreground">Not selected</span>
                        )}
                        {c.worksheet_name && <p className="text-xs text-muted-foreground">{c.worksheet_name}</p>}
                      </TableCell>
                      <TableCell>
                        <SheetStatusBadge status={c.status} enabled={c.enabled} />
                        {c.status === "reauth_required" && <p className="mt-1 text-xs text-red-700">⚠ Reauthorization Required</p>}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">{c.last_sync_at ? formatDateTime(c.last_sync_at, tz) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
