import { describe, expect, it } from "vitest";
import { respondentName } from "@/lib/forms/respondent-name";

const a = (field_label: string, value: string | null, field_type = "short_text") => ({ field_label, value, field_type });

describe("respondentName", () => {
  it("picks the plain name field", () => {
    expect(respondentName([a("Phone", "999"), a("Full Name", " Asha K ")])).toBe("Asha K");
  });
  it("prefers the respondent over other people's names", () => {
    expect(respondentName([a("Therapist name", "Dr Rao"), a("Patient Name", "Ravi")])).toBe("Ravi");
    expect(respondentName([a("Doctor Name", "Dr Rao")])).toBeNull();
  });
  it("prefers 'Name' over 'First name' and ignores empty or non-text answers", () => {
    expect(respondentName([a("First name", "Ravi"), a("Name", "Ravi Kumar")])).toBe("Ravi Kumar");
    expect(respondentName([a("Name", ""), a("Name", "x", "long_text")])).toBeNull();
    expect(respondentName(null)).toBeNull();
  });
});
