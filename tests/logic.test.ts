import { describe, expect, it } from "vitest";
import { computeActiveFields, computeVisibleFields, evaluateCondition } from "@/lib/forms/logic";
import type { FormField } from "@/types/forms";

const f = (field_id: string, extra: Partial<FormField> = {}): FormField => ({
  field_id,
  type: "short_text",
  label: field_id,
  required: false,
  settings: {},
  validation: {},
  logic: null,
  ...extra,
});

describe("evaluateCondition", () => {
  it("handles equals case-insensitively and for arrays", () => {
    expect(evaluateCondition({ fieldId: "a", operator: "equals", value: "no" }, "No")).toBe(true);
    expect(evaluateCondition({ fieldId: "a", operator: "equals", value: "Pain" }, ["Mobility", "Pain"])).toBe(true);
    expect(evaluateCondition({ fieldId: "a", operator: "not_equals", value: "Yes" }, "No")).toBe(true);
  });
  it("handles contains, empty, numeric comparisons", () => {
    expect(evaluateCondition({ fieldId: "a", operator: "contains", value: "back" }, "Lower back pain")).toBe(true);
    expect(evaluateCondition({ fieldId: "a", operator: "is_empty" }, "")).toBe(true);
    expect(evaluateCondition({ fieldId: "a", operator: "is_not_empty" }, [])).toBe(false);
    expect(evaluateCondition({ fieldId: "a", operator: "greater_than", value: "3" }, 4)).toBe(true);
    expect(evaluateCondition({ fieldId: "a", operator: "less_than", value: "3" }, "")).toBe(false);
  });
});

describe("computeVisibleFields", () => {
  const fields = [
    f("satisfied", { type: "yes_no" }),
    f("what_went_wrong", { logic: { action: "show", match: "all", conditions: [{ fieldId: "satisfied", operator: "equals", value: "No" }] } }),
    f("details", { logic: { action: "show", match: "all", conditions: [{ fieldId: "what_went_wrong", operator: "is_not_empty" }] } }),
    f("tracking", { settings: { hidden: true } }),
  ];

  it("shows a field when its condition matches", () => {
    expect(computeVisibleFields(fields, { satisfied: "No" }).has("what_went_wrong")).toBe(true);
    expect(computeVisibleFields(fields, { satisfied: "Yes" }).has("what_went_wrong")).toBe(false);
  });

  it("cascades: a field depending on a hidden field sees an empty value", () => {
    const v = computeVisibleFields(fields, { satisfied: "Yes", what_went_wrong: "stale text" });
    expect(v.has("details")).toBe(false);
  });

  it("never shows config-hidden fields but keeps them active", () => {
    expect(computeVisibleFields(fields, {}).has("tracking")).toBe(false);
    expect(computeActiveFields(fields, {}).has("tracking")).toBe(true);
  });

  it("supports hide action and any-match", () => {
    const g = [
      f("a"),
      f("b"),
      f("c", { logic: { action: "hide", match: "any", conditions: [{ fieldId: "a", operator: "equals", value: "x" }, { fieldId: "b", operator: "equals", value: "y" }] } }),
    ];
    expect(computeVisibleFields(g, { b: "y" }).has("c")).toBe(false);
    expect(computeVisibleFields(g, { a: "z" }).has("c")).toBe(true);
  });
});
