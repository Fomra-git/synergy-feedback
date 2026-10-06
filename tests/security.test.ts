import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret, signToken, verifyToken } from "@/lib/security/crypto";
import { contentMatchesMime, sanitizeFileName } from "@/lib/security/files";
import { csvRow, csvSafeCell } from "@/lib/forms/format";
import { escapeHtml, renderSubject } from "@/services/email/notifications";
import { parseSpreadsheetId, parseStartRow } from "@/lib/google/sheets-api";
import { classifyGoogleStatus } from "@/lib/google/errors";
import { zonedDayStart } from "@/services/submissions/query";

const KEY = randomBytes(32).toString("base64");
const SECRET = "test-secret-value-long-enough";

describe("token encryption", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encryptSecret("ya29.token", KEY);
    const b = encryptSecret("ya29.token", KEY);
    expect(a).not.toBe(b);
    expect(a).not.toContain("ya29");
    expect(decryptSecret(a, KEY)).toBe("ya29.token");
  });
  it("detects tampering and wrong keys", () => {
    const enc = encryptSecret("refresh", KEY);
    const parts = enc.split(":");
    parts[3] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join(":"), KEY)).toThrow();
    expect(() => decryptSecret(enc, randomBytes(32).toString("base64"))).toThrow();
  });
  it("rejects keys of the wrong length", () => {
    expect(() => encryptSecret("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("signed tokens", () => {
  it("verifies, rejects other purposes and tampering", () => {
    const t = signToken({ p: "pending/x.pdf" }, "upload", 60, SECRET);
    expect(verifyToken<{ p: string }>(t, "upload", SECRET)?.p).toBe("pending/x.pdf");
    expect(verifyToken(t, "google-oauth", SECRET)).toBeNull();
    const [body, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ p: "forms/other", exp: 9999999999 })).toString("base64url");
    expect(verifyToken(`${forged}.${sig}`, "upload", SECRET)).toBeNull();
    expect(verifyToken(`${body}.x${sig}`, "upload", SECRET)).toBeNull();
  });
  it("expires", () => {
    expect(verifyToken(signToken({}, "upload", -1, SECRET), "upload", SECRET)).toBeNull();
  });
});

describe("file validation", () => {
  it("checks magic bytes", () => {
    expect(contentMatchesMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), "application/pdf")).toBe(true);
    expect(contentMatchesMime(new TextEncoder().encode("<html><script>"), "application/pdf")).toBe(false);
    expect(contentMatchesMime(new TextEncoder().encode("<svg onload=alert(1)>"), "text/plain")).toBe(false);
    expect(contentMatchesMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), "image/jpeg")).toBe(true);
  });
  it("sanitises file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe(".._.._etc_passwd");
    expect(sanitizeFileName("")).toBe("file");
  });
});

describe("CSV export safety", () => {
  it("neutralises formula injection and escapes", () => {
    expect(csvSafeCell("=cmd|' /C calc'!A0")).toBe("'=cmd|' /C calc'!A0");
    expect(csvSafeCell("+91 98765")).toBe("'+91 98765");
    expect(csvSafeCell('He said "hi", ok')).toBe('"He said ""hi"", ok"');
    expect(csvRow(["a", null, 3])).toBe("a,,3\r\n");
  });
});

describe("email", () => {
  it("escapes HTML and renders subjects without header injection", () => {
    expect(escapeHtml(`<img src=x onerror="a">`)).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;");
    expect(renderSubject(undefined, { form: "Patient Feedback", branch: "Anna Nagar", number: "SW-1" })).toBe("New Patient Feedback Submission – Anna Nagar");
    expect(renderSubject("{form}\r\nBcc: x@y", { form: "F", branch: "", number: "1" })).not.toMatch(/[\r\n]/);
  });
});

describe("google helpers", () => {
  it("parses spreadsheet IDs and row numbers", () => {
    expect(parseSpreadsheetId("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit#gid=0")).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789");
    expect(parseSpreadsheetId("not a sheet")).toBeNull();
    expect(parseStartRow("'Responses'!A15:J17")).toBe(15);
  });
  it("classifies errors for retry decisions", () => {
    expect(classifyGoogleStatus(401)).toBe("auth");
    expect(classifyGoogleStatus(403, "userRateLimitExceeded")).toBe("rate_limit");
    expect(classifyGoogleStatus(403)).toBe("permission");
    expect(classifyGoogleStatus(503)).toBe("transient");
  });
});

describe("timezone day boundaries", () => {
  it("converts IST midnight to UTC", () => {
    expect(zonedDayStart("2026-10-06", "Asia/Kolkata")).toBe("2026-10-05T18:30:00.000Z");
  });
});
