import { describe, expect, it } from "vitest";
import { formCreateSchema, formDetailsSchema, formGroupColumns } from "@/schemas/form";
import { formGroupLabel } from "@/lib/forms/others";

const B = "11111111-1111-4111-8111-111111111111";

describe("Others forms", () => {
  it("requires a name when Others is chosen", () => {
    expect(formCreateSchema.safeParse({ name: "Hiring", branchId: "others" }).success).toBe(false);
    expect(formCreateSchema.safeParse({ name: "Hiring", branchId: "others", otherName: "R" }).success).toBe(false);
    expect(formCreateSchema.safeParse({ name: "Hiring", branchId: "others", otherName: "Recruitment" }).success).toBe(true);
    expect(formDetailsSchema.safeParse({ formId: B, name: "Hiring", branchId: "others", otherName: "", slug: "hiring" }).success).toBe(false);
  });
  it("maps the choice to columns", () => {
    expect(formGroupColumns({ branchId: "others", otherName: "  Events " })).toEqual({ branch_id: null, other_name: "Events" });
    expect(formGroupColumns({ branchId: B, otherName: "ignored" })).toEqual({ branch_id: B, other_name: null });
    expect(formGroupColumns({ branchId: "" })).toEqual({ branch_id: null, other_name: null });
  });
  it("labels forms in lists", () => {
    expect(formGroupLabel({ other_name: "Events", branch: null })).toBe("Others · Events");
    expect(formGroupLabel({ other_name: null, branch: { name: "Porur" } })).toBe("Porur");
    expect(formGroupLabel({ other_name: null, branch: null })).toBe("No branch");
  });
});
