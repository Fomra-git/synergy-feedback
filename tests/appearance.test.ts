import { describe, expect, it } from "vitest";
import { resolveFormPresentation } from "@/lib/forms/appearance";

const globals = {
  primaryColor: "#111111",
  backgroundColor: "#222222",
  buttonColor: "#333333",
  font: "rounded" as const,
  title: "",
  description: "",
};
const form = {
  name: "Anna Nagar Feedback",
  description: "Tell us about your visit.",
  settings: { appearance: { primaryColor: "#aaaaaa", backgroundColor: "#bbbbbb", buttonColor: "#cccccc", font: "serif" as const } },
};

describe("resolveFormPresentation", () => {
  it("uses the form's own look when global settings are off", () => {
    const r = resolveFormPresentation(form, { ...globals, title: "Global", description: "Global desc" });
    expect(r.title).toBe("Anna Nagar Feedback");
    expect(r.description).toBe("Tell us about your visit.");
    expect(r.appearance.primaryColor).toBe("#aaaaaa");
  });

  it("applies global colours and font when on, keeping the form's own title if no global title", () => {
    const r = resolveFormPresentation({ ...form, settings: { appearance: { ...form.settings.appearance, useGlobal: true } } }, globals);
    expect(r.appearance).toMatchObject({ primaryColor: "#111111", backgroundColor: "#222222", buttonColor: "#333333", font: "rounded" });
    expect(r.title).toBe("Anna Nagar Feedback");
    expect(r.description).toBe("Tell us about your visit.");
  });

  it("global title and description replace the form's own when set", () => {
    const r = resolveFormPresentation(
      { ...form, settings: { appearance: { useGlobal: true } } },
      { ...globals, title: "Synergy Wellness Feedback", description: "Your feedback helps us improve." },
    );
    expect(r.title).toBe("Synergy Wellness Feedback");
    expect(r.description).toBe("Your feedback helps us improve.");
  });
});
