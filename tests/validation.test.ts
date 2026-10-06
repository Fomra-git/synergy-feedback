import { describe, expect, it } from "vitest";
import { initialValues, splitIntoSteps, validateAnswers, validateFieldValue } from "@/lib/forms/validation";
import type { FormField } from "@/types/forms";

const f = (field_id: string, type: FormField["type"], extra: Partial<FormField> = {}): FormField => ({
  field_id,
  type,
  label: field_id,
  required: false,
  settings: {},
  validation: {},
  logic: null,
  ...extra,
});

describe("validateFieldValue", () => {
  it("requires values", () => {
    expect(validateFieldValue(f("n", "short_text", { required: true, label: "Name" }), "  ").error).toBe("Name is required.");
  });
  it("validates email and normalises case", () => {
    expect(validateFieldValue(f("e", "email"), "bad").error).toBeTruthy();
    expect(validateFieldValue(f("e", "email"), " John@Example.COM ").value).toBe("john@example.com");
  });
  it("validates phone numbers", () => {
    expect(validateFieldValue(f("p", "phone"), "98765 43210").value).toBe("98765 43210");
    expect(validateFieldValue(f("p", "phone"), "+91 (44) 4000-1001").error).toBeUndefined();
    expect(validateFieldValue(f("p", "phone"), "12").error).toBeTruthy();
    expect(validateFieldValue(f("p", "phone"), "call me").error).toBeTruthy();
  });
  it("enforces text length and regex", () => {
    const field = f("pin", "short_text", { validation: { minLength: 6, maxLength: 6, pattern: "[0-9]{6}", patternMessage: "6 digits" } });
    expect(validateFieldValue(field, "12345").error).toMatch(/at least 6/);
    expect(validateFieldValue(field, "abcdef").error).toBe("6 digits");
    expect(validateFieldValue(field, "600040").value).toBe("600040");
  });
  it("ignores invalid admin regex instead of crashing", () => {
    expect(validateFieldValue(f("x", "short_text", { validation: { pattern: "([" } }), "abc").value).toBe("abc");
  });
  it("validates numbers with bounds", () => {
    const field = f("age", "number", { validation: { min: 1, max: 120 } });
    expect(validateFieldValue(field, "42").value).toBe(42);
    expect(validateFieldValue(field, 0).error).toBeTruthy();
    expect(validateFieldValue(field, "abc").error).toBeTruthy();
  });
  it("only accepts configured options", () => {
    const field = f("t", "dropdown", { settings: { options: ["A", "B"] } });
    expect(validateFieldValue(field, "A").value).toBe("A");
    expect(validateFieldValue(field, "<script>").error).toBeTruthy();
    const multi = f("m", "checkbox", { settings: { options: ["A", "B", "C"] }, validation: { max: 2 } });
    expect(validateFieldValue(multi, ["C", "A"]).value).toEqual(["A", "C"]);
    expect(validateFieldValue(multi, ["A", "B", "C"]).error).toBeTruthy();
  });
  it("validates ratings, scales, yes/no and dates", () => {
    expect(validateFieldValue(f("r", "star_rating", { settings: { max: 5 } }), 6).error).toBeTruthy();
    expect(validateFieldValue(f("r", "star_rating"), 5).value).toBe(5);
    expect(validateFieldValue(f("s", "linear_scale", { settings: { min: 0, max: 10 } }), 0).value).toBe(0);
    expect(validateFieldValue(f("y", "yes_no"), "Maybe").error).toBeTruthy();
    expect(validateFieldValue(f("d", "date"), "2026-02-30").error).toBeTruthy();
    expect(validateFieldValue(f("d", "date"), "2026-10-06").value).toBe("2026-10-06");
    expect(validateFieldValue(f("t", "time"), "25:00").error).toBeTruthy();
    expect(validateFieldValue(f("dt", "datetime"), "2026-10-06T16:35").value).toBe("2026-10-06T16:35");
  });
  it("validates URLs (http/https only)", () => {
    expect(validateFieldValue(f("u", "url"), "javascript:alert(1)").error).toBeTruthy();
    expect(validateFieldValue(f("u", "url"), "https://synergy.example").value).toBe("https://synergy.example");
  });
  it("limits signature size and format", () => {
    expect(validateFieldValue(f("s", "signature"), "data:image/jpeg;base64,xx").error).toBeTruthy();
    expect(validateFieldValue(f("s", "signature"), "data:image/png;base64," + "A".repeat(500_000)).error).toBeTruthy();
    expect(validateFieldValue(f("s", "signature"), "data:image/png;base64,iVBORw0KGgo=").value).toBeTruthy();
  });
  it("validates file refs and limits", () => {
    const field = f("u", "file_upload", { settings: { maxFiles: 1, maxSizeMb: 1 } });
    const ref = { token: "x".repeat(20), name: "a.pdf", size: 100, type: "application/pdf" };
    expect(validateFieldValue(field, [ref]).value).toEqual([ref]);
    expect(validateFieldValue(field, [ref, ref]).error).toBeTruthy();
    expect(validateFieldValue(field, [{ ...ref, size: 5 * 1024 * 1024 }]).error).toBeTruthy();
    expect(validateFieldValue(field, ["evil"]).error).toBeTruthy();
  });
});

describe("validateAnswers", () => {
  const fields: FormField[] = [
    f("satisfied", "yes_no", { required: true }),
    f("why", "long_text", { required: true, logic: { action: "show", match: "all", conditions: [{ fieldId: "satisfied", operator: "equals", value: "No" }] } }),
    f("heading", "heading"),
  ];

  it("does not require fields hidden by logic and drops their values", () => {
    const r = validateAnswers(fields, { satisfied: "Yes", why: "should be dropped", extra: "unknown key" });
    expect(r.success).toBe(true);
    expect(r.values).toEqual({ satisfied: "Yes" });
  });

  it("requires conditionally visible fields", () => {
    const r = validateAnswers(fields, { satisfied: "No" });
    expect(r.success).toBe(false);
    expect(r.errors.why).toBeTruthy();
  });
});

describe("steps & initial values", () => {
  it("splits at sections", () => {
    const steps = splitIntoSteps([f("a", "short_text"), f("s1", "section"), f("b", "short_text"), f("c", "short_text")]);
    expect(steps).toHaveLength(2);
    expect(steps[1]!.section?.field_id).toBe("s1");
    expect(steps[1]!.fields.map((x) => x.field_id)).toEqual(["b", "c"]);
  });
  it("applies defaults and URL prefill", () => {
    const v = initialValues(
      [f("src", "short_text", { settings: { hidden: true, prefillParam: "source" } }), f("tags", "checkbox", { settings: { defaultValue: "A, B" } }), f("r", "rating", { settings: { defaultValue: "3" } })],
      { source: "qr-reception" },
    );
    expect(v).toEqual({ src: "qr-reception", tags: ["A", "B"], r: 3 });
  });
});
