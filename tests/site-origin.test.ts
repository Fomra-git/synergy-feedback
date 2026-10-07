import { describe, expect, it } from "vitest";
import { siteOrigin } from "@/lib/site-origin";

describe("siteOrigin", () => {
  it("drops any path so public links never point inside the admin", () => {
    expect(siteOrigin("https://synergy-feedback.vercel.app/admin/dashboard")).toBe("https://synergy-feedback.vercel.app");
    expect(siteOrigin("https://synergy-feedback.vercel.app/")).toBe("https://synergy-feedback.vercel.app");
  });
  it("adds https when the scheme is missing and falls back when empty", () => {
    expect(siteOrigin("feedback.synergywellness.com")).toBe("https://feedback.synergywellness.com");
    expect(siteOrigin(undefined)).toBe("http://localhost:3000");
    expect(siteOrigin("http://localhost:3000")).toBe("http://localhost:3000");
  });
});
