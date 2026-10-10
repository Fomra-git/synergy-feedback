import { describe, expect, it } from "vitest";
import { resolveNotificationRecipients } from "@/lib/email/recipients";

const base = {
  formEnabled: true,
  formRecipients: ["Form@x.com"],
  allForms: ["all@x.com", "form@x.com"],
  branchRecipients: { b1: ["branch1@x.com"], b2: ["branch2@x.com"] },
  branchId: "b1",
};

describe("resolveNotificationRecipients", () => {
  it("combines all-forms, branch and form recipients without duplicates", () => {
    expect(resolveNotificationRecipients(base)).toEqual(["all@x.com", "form@x.com", "branch1@x.com"]);
  });
  it("only includes the submission's own branch", () => {
    expect(resolveNotificationRecipients({ ...base, branchId: "b2" })).toContain("branch2@x.com");
    expect(resolveNotificationRecipients({ ...base, branchId: null })).not.toContain("branch1@x.com");
  });
  it("sends nothing when the form has notifications off", () => {
    expect(resolveNotificationRecipients({ ...base, formEnabled: false })).toEqual([]);
  });
});
