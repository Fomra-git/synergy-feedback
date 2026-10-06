import "server-only";
import { classifyGoogleStatus, GoogleApiError } from "./errors";

const SHEETS = "https://sheets.googleapis.com/v4/spreadsheets";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

export interface SpreadsheetSummary {
  id: string;
  name: string;
  modifiedTime?: string;
  url?: string;
}

export interface WorksheetInfo {
  sheetId: number;
  title: string;
  rowCount?: number;
  columnCount?: number;
}

export interface SpreadsheetInfo {
  id: string;
  title: string;
  url: string;
  sheets: WorksheetInfo[];
}

/** Quotes a worksheet title for A1 notation: 'My Sheet'!A1 */
export function a1Sheet(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Column index (0-based) → letters (0 → A, 26 → AA). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/** Extracts the first row number from an A1 range such as 'Responses'!A15:J17 */
export function parseStartRow(updatedRange: string | undefined): number | null {
  if (!updatedRange) return null;
  const m = updatedRange.match(/![A-Z]+(\d+)/);
  return m ? Number(m[1]) : null;
}

export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  const m = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})/);
  if (m) return m[1]!;
  return /^[a-zA-Z0-9-_]{20,}$/.test(trimmed) ? trimmed : null;
}

/**
 * Minimal server-side client for the official Google Sheets & Drive REST APIs.
 * The access token is supplied per call and never leaves the server.
 */
export class SheetsClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
    } catch (err) {
      throw new GoogleApiError(err instanceof Error ? err.message : "Network error", "transient");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; errors?: { reason?: string }[]; status?: string };
      };
      const reason = body.error?.errors?.[0]?.reason ?? body.error?.status;
      throw new GoogleApiError(
        body.error?.message ?? `Google API error (${res.status})`,
        classifyGoogleStatus(res.status, reason),
        res.status,
      );
    }
    return (await res.json()) as T;
  }

  async listSpreadsheets(query = "", pageToken?: string): Promise<{ files: SpreadsheetSummary[]; nextPageToken?: string }> {
    const q = ["mimeType='application/vnd.google-apps.spreadsheet'", "trashed=false"];
    if (query.trim()) q.push(`name contains '${query.trim().replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`);
    const url = new URL(DRIVE);
    url.searchParams.set("q", q.join(" and "));
    url.searchParams.set("fields", "nextPageToken, files(id, name, modifiedTime, webViewLink)");
    url.searchParams.set("orderBy", "modifiedTime desc");
    url.searchParams.set("pageSize", "25");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await this.request<{
      files: { id: string; name: string; modifiedTime?: string; webViewLink?: string }[];
      nextPageToken?: string;
    }>(url.toString());
    return {
      files: data.files.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, url: f.webViewLink })),
      nextPageToken: data.nextPageToken,
    };
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    const url = `${SHEETS}/${encodeURIComponent(spreadsheetId)}?fields=spreadsheetId,spreadsheetUrl,properties.title,sheets.properties(sheetId,title,gridProperties)`;
    const data = await this.request<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      properties: { title: string };
      sheets: { properties: { sheetId: number; title: string; gridProperties?: { rowCount?: number; columnCount?: number } } }[];
    }>(url);
    return {
      id: data.spreadsheetId,
      title: data.properties.title,
      url: data.spreadsheetUrl,
      sheets: (data.sheets ?? []).map((s) => ({
        sheetId: s.properties.sheetId,
        title: s.properties.title,
        rowCount: s.properties.gridProperties?.rowCount,
        columnCount: s.properties.gridProperties?.columnCount,
      })),
    };
  }

  async createSpreadsheet(title: string, worksheetTitle: string): Promise<SpreadsheetInfo> {
    const data = await this.request<{
      spreadsheetId: string;
      spreadsheetUrl: string;
      properties: { title: string };
      sheets: { properties: { sheetId: number; title: string } }[];
    }>(SHEETS, {
      method: "POST",
      body: JSON.stringify({
        properties: { title },
        sheets: [{ properties: { title: worksheetTitle, gridProperties: { frozenRowCount: 1 } } }],
      }),
    });
    return {
      id: data.spreadsheetId,
      title: data.properties.title,
      url: data.spreadsheetUrl,
      sheets: data.sheets.map((s) => ({ sheetId: s.properties.sheetId, title: s.properties.title })),
    };
  }

  async addWorksheet(spreadsheetId: string, title: string): Promise<WorksheetInfo> {
    const data = await this.request<{ replies: { addSheet: { properties: { sheetId: number; title: string } } }[] }>(
      `${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }],
        }),
      },
    );
    const p = data.replies[0]!.addSheet.properties;
    return { sheetId: p.sheetId, title: p.title };
  }

  async getValues(spreadsheetId: string, range: string): Promise<string[][]> {
    const data = await this.request<{ values?: string[][] }>(
      `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?majorDimension=ROWS`,
    );
    return data.values ?? [];
  }

  async updateValues(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<void> {
    await this.request(
      `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values }) },
    );
  }

  /**
   * Appends rows. valueInputOption=RAW stores values literally, so a patient
   * typing "=IMPORTXML(...)" can never inject a formula into the sheet.
   */
  async appendRows(spreadsheetId: string, range: string, values: (string | number)[][]): Promise<number | null> {
    const data = await this.request<{ updates?: { updatedRange?: string } }>(
      `${SHEETS}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS&includeValuesInResponse=false`,
      { method: "POST", body: JSON.stringify({ majorDimension: "ROWS", values }) },
    );
    return parseStartRow(data.updates?.updatedRange);
  }

  async formatHeaderRow(spreadsheetId: string, sheetId: number): Promise<void> {
    await this.request(`${SHEETS}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.93, green: 0.97, blue: 0.96 } } },
              fields: "userEnteredFormat(textFormat,backgroundColor)",
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: "gridProperties.frozenRowCount",
            },
          },
        ],
      }),
    });
  }
}
