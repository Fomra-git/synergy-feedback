import { describe, expect, it } from "vitest";
import { logoSrc } from "@/lib/logo-src";

describe("logoSrc", () => {
  it("routes uploaded Supabase logos through the app", () => {
    expect(logoSrc("https://abc.supabase.co/storage/v1/object/public/branding/logos/1f2e3d4c-aaaa-bbbb.png")).toBe("/api/logo/logos/1f2e3d4c-aaaa-bbbb.png");
    expect(logoSrc("http://127.0.0.1:54321/storage/v1/object/public/branding/logos/x1234567.webp?v=2")).toBe("/api/logo/logos/x1234567.webp");
  });
  it("leaves other URLs alone", () => {
    expect(logoSrc("https://www.synergyphysio.in/logo.png")).toBe("https://www.synergyphysio.in/logo.png");
    expect(logoSrc("")).toBeNull();
    expect(logoSrc(null)).toBeNull();
  });
});
