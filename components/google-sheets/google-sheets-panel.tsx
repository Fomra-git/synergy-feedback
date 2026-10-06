"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  Sheet,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { SheetStatusBadge } from "@/components/admin/status-badges";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { formatDateTime } from "@/lib/forms/format";
import { formatNumber } from "@/lib/utils";
import type { SheetColumn, SheetConnectionRow, SyncStatus } from "@/types/db";
import type { SpreadsheetInfo, SpreadsheetSummary } from "@/lib/google/sheets-api";
import {
  attachGoogleAccountAction,
  connectExistingSheetAction,
  createSheetAction,
  disconnectSheetAction,
  getSpreadsheetAction,
  listSpreadsheetsAction,
  retrySyncAction,
  setSheetEnabledAction,
  testSheetConnectionAction,
  updateSheetMappingAction,
} from "@/app/admin/(console)/forms/google-actions";
import { FieldMapping } from "./field-mapping";

export interface GoogleSheetsPanelProps {
  formId: string;
  formName: string;
  notice: string | null;
  configured: boolean;
  driveListing: boolean;
  connection: SheetConnectionRow | null;
  accounts: { id: string; email: string; status: string }[];
  columns: SheetColumn[];
  syncCounts: Record<SyncStatus, number>;
  timeZone: string;
}

const NOTICES: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Google account authorized. Now choose a spreadsheet." },
  denied: { ok: false, text: "Google authorization was cancelled." },
  expired: { ok: false, text: "The authorization session expired. Please try again." },
  invalid_state: { ok: false, text: "Security check failed. Please try connecting again." },
  missing_scope: { ok: false, text: "Please allow access to Google Sheets when asked." },
  no_refresh_token: { ok: false, text: "Google did not grant offline access. Remove Synergy Feedback from your Google account permissions and try again." },
  not_configured: { ok: false, text: "Google OAuth is not configured on the server yet." },
  error: { ok: false, text: "Could not connect to Google. Please try again." },
  session: { ok: false, text: "Your session changed during authorization. Please sign in and try again." },
};

function oauthHref(formId: string, hint?: string) {
  const p = new URLSearchParams({ formId });
  if (hint) p.set("hint", hint);
  return `/api/google/oauth/start?${p.toString()}`;
}

function SetupWizard({ formId, formName, driveListing, onDone, onCancel }: { formId: string; formName: string; driveListing: boolean; onDone: () => void; onCancel?: () => void }) {
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [query, setQuery] = useState("");
  const [files, setFiles] = useState<SpreadsheetSummary[] | null>(null);
  const [nextPage, setNextPage] = useState<string | undefined>();
  const [manual, setManual] = useState("");
  const [sheet, setSheet] = useState<SpreadsheetInfo | null>(null);
  const [worksheet, setWorksheet] = useState<string>("");
  const [newWorksheet, setNewWorksheet] = useState("Responses");
  const [title, setTitle] = useState(`Synergy Feedback - ${formName}`);
  const [backfill, setBackfill] = useState(true);
  const [loading, setLoading] = useState(false);
  const [pending, start] = useTransition();

  const search = async (q: string, page?: string) => {
    setLoading(true);
    const res = await listSpreadsheetsAction(formId, q, page);
    setLoading(false);
    if (res.ok) {
      setFiles((prev) => (page && prev ? [...prev, ...res.data.files] : res.data.files));
      setNextPage(res.data.nextPageToken);
    } else toast.error(res.error);
  };

  useEffect(() => {
    if (mode !== "existing" || !driveListing) return;
    const t = setTimeout(() => void search(query), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, driveListing]);

  const pick = async (idOrUrl: string) => {
    setLoading(true);
    const res = await getSpreadsheetAction(formId, idOrUrl);
    setLoading(false);
    if (res.ok) {
      setSheet(res.data);
      setWorksheet(String(res.data.sheets[0]?.sheetId ?? "new"));
    } else toast.error(res.error);
  };

  const connect = () =>
    start(async () => {
      const res =
        mode === "new"
          ? await createSheetAction(formId, { title, backfill })
          : await connectExistingSheetAction(formId, {
              spreadsheetId: sheet!.id,
              worksheetId: worksheet === "new" ? null : Number(worksheet),
              newWorksheetName: worksheet === "new" ? newWorksheet : null,
              backfill,
            });
      if (res.ok) {
        toast.success("Google Sheet connected", { description: res.data.queued ? `${formatNumber(res.data.queued)} existing submissions queued for sync.` : undefined });
        onDone();
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-5">
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Connect Google Sheet</legend>
        {(["new", "existing"] as const).map((m) => (
          <label key={m} className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${mode === m ? "border-primary bg-accent/50" : ""}`}>
            <input type="radio" name="sheet-mode" className="mt-1 accent-[var(--primary)]" checked={mode === m} onChange={() => setMode(m)} />
            <span>
              <span className="block text-sm font-medium">{m === "new" ? "Create New Spreadsheet" : "Select Existing Spreadsheet"}</span>
              <span className="text-xs text-muted-foreground">{m === "new" ? "We create it in your Google Drive with a “Responses” worksheet." : "Pick a spreadsheet the connected account can edit."}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {mode === "new" ? (
        <div className="space-y-2">
          <Label htmlFor="gs-title">Spreadsheet name</Label>
          <Input id="gs-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
      ) : sheet ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="size-5 text-emerald-700" aria-hidden />
            <p className="flex-1 truncate text-sm font-medium">{sheet.title}</p>
            <Button variant="ghost" size="sm" onClick={() => setSheet(null)}>Change</Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="gs-ws">Worksheet</Label>
            <NativeSelect id="gs-ws" value={worksheet} onChange={(e) => setWorksheet(e.target.value)}>
              {sheet.sheets.map((s) => (
                <option key={s.sheetId} value={s.sheetId}>{s.title}</option>
              ))}
              <option value="new">+ Create a new worksheet…</option>
            </NativeSelect>
            {worksheet === "new" && <Input aria-label="New worksheet name" value={newWorksheet} onChange={(e) => setNewWorksheet(e.target.value)} maxLength={90} />}
            <p className="text-xs text-muted-foreground">If the worksheet already has a header row it is kept as-is; new columns are only ever added to the end.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {driveListing ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your spreadsheets…" className="pl-9" aria-label="Search spreadsheets" />
              </div>
              <div className="max-h-72 overflow-y-auto rounded-lg border">
                {files === null || (loading && !files.length) ? (
                  <p className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Loading spreadsheets…</p>
                ) : files.length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No spreadsheets found.</p>
                ) : (
                  <ul className="divide-y">
                    {files.map((f) => (
                      <li key={f.id}>
                        <button type="button" onClick={() => pick(f.id)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-muted">
                          <FileSpreadsheet className="size-4 shrink-0 text-emerald-700" aria-hidden />
                          <span className="flex-1 truncate text-sm">{f.name}</span>
                          {f.modifiedTime && <span className="text-xs text-muted-foreground">{new Date(f.modifiedTime).toLocaleDateString()}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {nextPage && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={() => search(query, nextPage)} disabled={loading}>
                    Load more
                  </Button>
                )}
              </div>
            </>
          ) : null}
          <details className="rounded-lg border p-3 text-sm" open={!driveListing}>
            <summary className="cursor-pointer font-medium">Advanced: paste a spreadsheet link</summary>
            <div className="mt-3 flex gap-2">
              <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" aria-label="Spreadsheet link or ID" />
              <Button variant="outline" onClick={() => pick(manual)} disabled={!manual || loading}>Use</Button>
            </div>
          </details>
        </div>
      )}

      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={backfill} onChange={(e) => setBackfill(e.target.checked)} />
        <span>
          Also send existing submissions to this sheet
          <span className="block text-xs text-muted-foreground">Rows already present (matched by Submission ID) are never duplicated.</span>
        </span>
      </label>

      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
        <Button onClick={connect} disabled={pending || (mode === "existing" && !sheet)}>
          {pending ? <Loader2 className="animate-spin" /> : <Plug />}
          {mode === "new" ? "Create & connect" : "Connect"}
        </Button>
      </div>
    </div>
  );
}

export function GoogleSheetsPanel(props: GoogleSheetsPanelProps) {
  const { formId, formName, connection, accounts, configured, driveListing, columns, syncCounts, timeZone, notice } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [changing, setChanging] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [accountId, setAccountId] = useState(accounts.find((a) => a.status === "connected")?.id ?? "");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const n = notice ? NOTICES[notice] : null;

  useEffect(() => {
    if (n) (n.ok ? toast.success : toast.error)(n.text);
  }, [n]);

  const refresh = () => router.refresh();
  const active = connection && connection.status !== "disconnected" ? connection : null;

  const header = (
    <CardHeader className="flex-row items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
          <Sheet className="size-5" aria-hidden />
        </span>
        <div>
          <CardTitle>Google Sheets</CardTitle>
          <CardDescription>Every submission is automatically added as a new row.</CardDescription>
        </div>
      </div>
      <SheetStatusBadge status={active?.status} enabled={active?.enabled} />
    </CardHeader>
  );

  if (!configured) {
    return (
      <Card>
        {header}
        <CardContent>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Google OAuth is not configured. Set <code>GOOGLE_CLIENT_ID</code>, <code>GOOGLE_CLIENT_SECRET</code>, <code>GOOGLE_REDIRECT_URI</code> and <code>TOKEN_ENCRYPTION_KEY</code> on the server (see README → Google Cloud Setup).
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not connected: choose an account
  if (!active) {
    const usable = accounts.filter((a) => a.status === "connected");
    return (
      <Card>
        {header}
        <CardContent>
          <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-10 text-center">
            <FileSpreadsheet className="mb-3 size-8 text-muted-foreground" aria-hidden />
            <p className="font-semibold">Google Sheet Not Connected</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Connect a Google Sheet to automatically receive new submissions.</p>
            {usable.length > 0 ? (
              <div className="mt-5 w-full max-w-sm space-y-3">
                <NativeSelect aria-label="Google account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  {usable.map((a) => (
                    <option key={a.id} value={a.id}>{a.email}</option>
                  ))}
                </NativeSelect>
                <Button
                  className="w-full"
                  disabled={pending || !accountId}
                  onClick={() =>
                    start(async () => {
                      const res = await attachGoogleAccountAction(formId, accountId);
                      if (res.ok) refresh();
                      else toast.error(res.error);
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Plug />} Connect Google Sheet
                </Button>
                <a href={oauthHref(formId)} className="block text-sm font-medium text-primary hover:underline">Use a different Google account</a>
              </div>
            ) : (
              <Button asChild className="mt-5">
                <a href={oauthHref(formId)}><Plug /> Connect Google Sheet</a>
              </Button>
            )}
            <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" aria-hidden /> The spreadsheet stays in your Google account. Tokens are encrypted and never sent to browsers.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (active.status === "pending_setup" || changing) {
    return (
      <Card>
        {header}
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Connected Google Account: <span className="font-medium text-foreground">{active.google_account_email}</span>
          </p>
          <SetupWizard
            formId={formId}
            formName={formName}
            driveListing={driveListing}
            onDone={() => {
              setChanging(false);
              refresh();
            }}
            onCancel={changing ? () => setChanging(false) : undefined}
          />
        </CardContent>
      </Card>
    );
  }

  const failed = syncCounts.failed;
  const pendingCount = syncCounts.pending + syncCounts.processing;

  return (
    <>
      <Card>
        {header}
        <CardContent className="space-y-5">
          {active.status === "reauth_required" && (
            <div role="alert" className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center">
              <AlertTriangle className="size-5 shrink-0" aria-hidden />
              <p className="flex-1">Google Sheet connection requires reauthorization. Submissions are safely stored and will sync after you reconnect.</p>
              <Button asChild size="sm" variant="destructive">
                <a href={oauthHref(formId, active.google_account_email ?? undefined)}>Reauthorize</a>
              </Button>
            </div>
          )}
          {active.status === "error" && active.last_error && (
            <div role="alert" className="flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <AlertTriangle className="size-5 shrink-0" aria-hidden />
              <p>{active.last_error}</p>
            </div>
          )}

          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Connected Account</dt>
              <dd className="font-medium break-all">{active.google_account_email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Spreadsheet</dt>
              <dd className="font-medium">{active.spreadsheet_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Worksheet</dt>
              <dd className="font-medium">{active.worksheet_name}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last Sync</dt>
              <dd className="font-medium">{active.last_sync_at ? formatDateTime(active.last_sync_at, timeZone) : "Not yet"}</dd>
            </div>
          </dl>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="gs-enabled">Enable Google Sheets</Label>
              <p className="text-xs text-muted-foreground">Pause to stop sending new submissions without disconnecting.</p>
            </div>
            <Switch
              id="gs-enabled"
              checked={active.enabled}
              disabled={pending}
              onCheckedChange={(v) =>
                start(async () => {
                  const res = await setSheetEnabledAction(formId, v);
                  if (res.ok) refresh();
                  else toast.error(res.error);
                })
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-lg font-semibold text-emerald-800 tabular-nums">{formatNumber(syncCounts.synced)}</p>
              <p className="text-xs text-emerald-800">✓ Synced</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-3">
              <p className="text-lg font-semibold text-amber-800 tabular-nums">{formatNumber(pendingCount)}</p>
              <p className="text-xs text-amber-800">⏳ Pending</p>
            </div>
            <div className="rounded-lg bg-red-50 p-3">
              <p className="text-lg font-semibold text-red-800 tabular-nums">{formatNumber(failed)}</p>
              <p className="text-xs text-red-800">⚠ Failed</p>
            </div>
          </div>

          {test && (
            <p role="status" className={`flex items-start gap-2 rounded-lg p-3 text-sm ${test.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>
              {test.ok ? <CheckCircle2 className="size-4 shrink-0" /> : <AlertTriangle className="size-4 shrink-0" />}
              {test.message}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            {active.spreadsheet_url && (
              <Button asChild variant="outline" size="sm">
                <a href={active.spreadsheet_url} target="_blank" rel="noreferrer"><ExternalLink /> Open Google Sheet</a>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await testSheetConnectionAction(formId);
                  if (res.ok) {
                    setTest(res.data);
                    refresh();
                  } else toast.error(res.error);
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Test Connection
            </Button>
            {(failed > 0 || pendingCount > 0) && (
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await retrySyncAction({ formId });
                    if (res.ok) {
                      toast.success(`Retry started: ${res.data.synced} synced${res.data.failed ? `, ${res.data.failed} still failing` : ""}`);
                      refresh();
                    } else toast.error(res.error);
                  })
                }
              >
                <RefreshCw /> Retry Sync
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setChanging(true)}>
              <FileSpreadsheet /> Change spreadsheet
            </Button>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDisconnect(true)}>
              <Unplug /> Disconnect
            </Button>
          </div>
        </CardContent>
      </Card>

      <FieldMapping
        columns={columns}
        onSave={async (headers) => {
          const res = await updateSheetMappingAction(formId, headers);
          if (res.ok) {
            toast.success(res.message);
            refresh();
          } else toast.error(res.error);
        }}
      />

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Google Sheet?"
        description={
          <>
            <p>Existing submission data in the Google Sheet will not be deleted.</p>
            <p>New submissions will no longer be synchronized until another Google Sheet is connected.</p>
          </>
        }
        confirmLabel="Disconnect"
        destructive
        onConfirm={() =>
          start(async () => {
            const res = await disconnectSheetAction(formId);
            if (res.ok) {
              toast.success(res.message);
              refresh();
            } else toast.error(res.error);
          })
        }
      />
    </>
  );
}
