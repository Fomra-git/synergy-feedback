import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, nextAttemptDelayMs, syncJobs, type SheetApi, type SyncDeps } from "@/services/google-sheets/engine";
import { adoptExistingHeaders, buildRow, reconcileColumns } from "@/services/google-sheets/columns";
import { GoogleApiError } from "@/lib/google/errors";
import type { SheetConnectionRow, SyncLogRow } from "@/types/db";
import type { FormField } from "@/types/forms";

const field = (field_id: string, label: string, type: FormField["type"] = "short_text"): FormField => ({
  field_id,
  type,
  label,
  required: false,
  settings: {},
  validation: {},
  logic: null,
});

/** In-memory Google Sheet that understands the subset of A1 ranges the engine uses. */
class FakeSheet implements SheetApi {
  rows: string[][] = [];
  appendCalls = 0;
  failNextAppend: GoogleApiError | null = null;
  async getValues(_id: string, range: string) {
    const col = range.split("!")[1]!.split(":")[0]!.replace(/\d+/g, "");
    if (col === "1") return [this.rows[0] ?? []];
    const idx = col.charCodeAt(0) - 65;
    return this.rows.map((r) => [r[idx] ?? ""]);
  }
  async updateValues(_id: string, range: string, values: (string | number)[][]) {
    if (range.includes("A1:")) this.rows[0] = values[0]!.map(String);
  }
  async appendRows(_id: string, _range: string, values: (string | number)[][]) {
    if (this.failNextAppend) {
      const e = this.failNextAppend;
      this.failNextAppend = null;
      throw e;
    }
    this.appendCalls++;
    const start = this.rows.length + 1;
    this.rows.push(...values.map((r) => r.map(String)));
    return start;
  }
  async formatHeaderRow() {}
}

function setup(opts: { fields?: FormField[]; conn?: Partial<SheetConnectionRow>; getClientError?: GoogleApiError } = {}) {
  const sheet = new FakeSheet();
  const logs = new Map<string, Partial<SyncLogRow>>();
  const conn: SheetConnectionRow = {
    id: "c1",
    form_id: "f1",
    google_account_id: "a1",
    google_account_email: "a@x.com",
    spreadsheet_id: "s1",
    spreadsheet_name: "S",
    spreadsheet_url: null,
    worksheet_id: 0,
    worksheet_name: "Responses",
    status: "connected",
    enabled: true,
    column_map: [],
    headers_hash: null,
    last_sync_at: null,
    last_error: null,
    created_at: "",
    updated_at: "",
    connected_at: null,
    ...opts.conn,
  };
  const fields = opts.fields ?? [field("patient_name", "Patient Name"), field("rating", "Rating", "star_rating")];
  const deps: SyncDeps = {
    timeZone: "Asia/Kolkata",
    now: () => new Date("2026-10-06T11:05:00Z"),
    getConnection: async () => conn,
    getClient: async () => {
      if (opts.getClientError) throw opts.getClientError;
      return sheet;
    },
    getFormContext: async () => ({ name: "Patient Feedback", branchName: "Anna Nagar", fields, sheetSettings: {} }),
    getSubmissions: async (ids) =>
      ids.map((id) => ({
        id,
        submission_number: `SW-20261006-${id.padStart(6, "0")}`,
        submitted_at: "2026-10-06T11:05:00Z",
        user_agent: null,
        ip_hash: null,
        answers: [
          { field_id: "patient_name", field_type: "short_text", value: `Patient ${id}`, value_json: null },
          { field_id: "rating", field_type: "star_rating", value: "5", value_json: 5 },
        ],
      })),
    updateConnection: async (_id, patch) => {
      Object.assign(conn, patch);
    },
    updateLog: async (id, patch) => {
      logs.set(id, { ...(logs.get(id) ?? {}), ...patch });
    },
  };
  return { sheet, logs, conn, deps, fields };
}

const job = (n: string, attempt = 1, extra: Partial<SyncLogRow> = {}): SyncLogRow => ({
  id: `log${n}`,
  submission_id: n,
  form_id: "f1",
  connection_id: "c1",
  spreadsheet_id: "s1",
  worksheet_name: "Responses",
  status: "processing",
  attempt_count: attempt,
  google_row_number: null,
  error_message: null,
  error_kind: null,
  next_attempt_at: null,
  locked_at: null,
  attempted_at: null,
  synced_at: null,
  created_at: "",
  ...extra,
});

describe("syncJobs", () => {
  it("writes headers and appends rows in one batch", async () => {
    const { sheet, logs, deps, conn } = setup();
    const summary = await syncJobs([job("1"), job("2")], deps);
    expect(summary.synced).toBe(2);
    expect(sheet.rows[0]).toEqual(["Submission ID", "Submitted At", "Form Name", "Branch", "Patient Name", "Rating"]);
    expect(sheet.rows[1]).toEqual(["SW-20261006-000001", "2026-10-06 16:35:00", "Patient Feedback", "Anna Nagar", "Patient 1", "5"]);
    expect(sheet.appendCalls).toBe(1);
    expect(logs.get("log1")).toMatchObject({ status: "synced", google_row_number: 2 });
    expect(logs.get("log2")).toMatchObject({ status: "synced", google_row_number: 3 });
    expect(conn.last_sync_at).toBeTruthy();
  });

  it("never duplicates a row when retrying an attempt that may have reached Google", async () => {
    const { sheet, logs, deps } = setup();
    await syncJobs([job("1")], deps);
    expect(sheet.rows).toHaveLength(2);
    // Simulate: the previous attempt appended but the result was lost; retry claims it with attempt 2.
    const summary = await syncJobs([job("1", 2)], deps);
    expect(summary.alreadyPresent).toBe(1);
    expect(sheet.rows).toHaveLength(2);
    expect(logs.get("log1")).toMatchObject({ status: "synced", google_row_number: 2 });
  });

  it("marks transient failures for retry with backoff, keeping the submission safe", async () => {
    const { sheet, logs, deps } = setup();
    sheet.failNextAppend = new GoogleApiError("backend error", "transient", 503);
    const summary = await syncJobs([job("1")], deps);
    expect(summary.failed).toBe(1);
    const log = logs.get("log1")!;
    expect(log.status).toBe("failed");
    expect(log.error_kind).toBe("transient");
    expect(new Date(log.next_attempt_at!).getTime()).toBe(new Date("2026-10-06T11:05:00Z").getTime() + nextAttemptDelayMs(1));
  });

  it("stops retrying after the attempt limit", async () => {
    const { sheet, logs, deps } = setup();
    sheet.failNextAppend = new GoogleApiError("backend error", "transient", 503);
    await syncJobs([job("1", MAX_ATTEMPTS)], deps);
    expect(logs.get("log1")).toMatchObject({ status: "failed", next_attempt_at: null });
    expect(logs.get("log1")!.error_message).toMatch(/retry limit/);
  });

  it("does not retry permanent errors and flags the connection", async () => {
    const { sheet, logs, deps, conn } = setup();
    sheet.failNextAppend = new GoogleApiError("forbidden", "permission", 403);
    await syncJobs([job("1")], deps);
    expect(logs.get("log1")).toMatchObject({ status: "failed", next_attempt_at: null, error_kind: "config" });
    expect(conn.status).toBe("error");
  });

  it("waits for reauthorization when the token is revoked", async () => {
    const { logs, deps, conn } = setup({ getClientError: new GoogleApiError("invalid_grant", "auth", 400) });
    const flagged: string[] = [];
    deps.markAccountReauth = async (id) => {
      flagged.push(id);
    };
    await syncJobs([job("1")], deps);
    expect(flagged).toEqual(["a1"]);
    expect(logs.get("log1")).toMatchObject({ status: "failed", error_kind: "auth", next_attempt_at: null });
    expect(logs.get("log1")!.error_message).toBe("Google Sheet connection requires reauthorization.");
    expect(conn.status).toBe("reauth_required");
  });

  it("skips jobs for disconnected sheets", async () => {
    const { logs, deps } = setup({ conn: { status: "disconnected" } });
    const summary = await syncJobs([job("1")], deps);
    expect(summary.skipped).toBe(1);
    expect(logs.get("log1")!.status).toBe("skipped");
  });

  it("adds new columns for new fields and keeps columns of removed fields", async () => {
    const ctx = setup();
    await syncJobs([job("1")], ctx.deps);
    // Admin removes "rating" and adds "age"
    ctx.deps.getFormContext = async () => ({ name: "Patient Feedback", branchName: "Anna Nagar", fields: [field("patient_name", "Patient Name"), field("age", "Age", "number")], sheetSettings: {} });
    await syncJobs([job("2")], ctx.deps);
    expect(ctx.sheet.rows[0]).toEqual(["Submission ID", "Submitted At", "Form Name", "Branch", "Patient Name", "Rating", "Age"]);
    expect(ctx.sheet.rows[1]![5]).toBe("5"); // historical data untouched
    expect(ctx.sheet.rows[2]![5]).toBe("5"); // answer still present in submission 2's data
  });
});

describe("columns", () => {
  const fields = [field("name", "Name"), field("comments", "Comments", "long_text"), field("h", "Heading", "heading")];
  it("ignores layout fields and puts Submission ID first", () => {
    const cols = reconcileColumns([], fields, { includeFormName: false, includeBranch: false });
    expect(cols.map((c) => c.header)).toEqual(["Submission ID", "Submitted At", "Name", "Comments"]);
  });
  it("keeps custom headers but follows label changes otherwise", () => {
    const existing = reconcileColumns([], fields, {}).map((c) => (c.key === "field:name" ? { ...c, header: "Patient", custom: true } : c));
    const renamed = [field("name", "Full Name"), field("comments", "Feedback", "long_text")];
    const cols = reconcileColumns(existing, renamed, {});
    expect(cols.find((c) => c.key === "field:name")!.header).toBe("Patient");
    expect(cols.find((c) => c.key === "field:comments")!.header).toBe("Feedback");
  });
  it("adopts an existing header row without moving data", () => {
    const cols = adoptExistingHeaders(["Submission ID", "Notes (manual)", "Name"], fields, { includeFormName: false, includeBranch: false });
    expect(cols.slice(0, 3).map((c) => c.key)).toEqual(["meta:submission_id", "legacy:1", "field:name"]);
    expect(cols.map((c) => c.header)).toEqual(["Submission ID", "Notes (manual)", "Name", "Submitted At", "Comments"]);
  });
  it("builds rows aligned to columns", () => {
    const cols = reconcileColumns([], fields, { includeFormName: false, includeBranch: false });
    const row = buildRow(cols, {
      submissionNumber: "SW-1",
      submittedAt: "2026-10-06T11:05:00Z",
      formName: "F",
      branchName: "B",
      timeZone: "Asia/Kolkata",
      answers: new Map([["comments", { field_type: "long_text", value: "=HYPERLINK(\"x\")", value_json: null }]]),
    });
    expect(row).toEqual(["SW-1", "2026-10-06 16:35:00", "", "=HYPERLINK(\"x\")"]); // stored RAW by the API, never evaluated
  });
});
