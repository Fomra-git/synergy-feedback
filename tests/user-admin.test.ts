import { describe, expect, it } from "vitest";
import { canManageUser, checkAssignableAccess, normaliseAccess, type Manager } from "@/lib/auth/user-admin";

const B1 = "11111111-1111-4111-8111-111111111111";
const B2 = "22222222-2222-4222-8222-222222222222";
const all = [B1, B2];
const superA: Manager = { userId: "s", role: "super_admin", branchIds: [] };
const admin: Manager = { userId: "a", role: "admin", branchIds: [] };
const scoped: Manager = { userId: "b", role: "admin", branchIds: [B1] };
const staff: Manager = { userId: "t", role: "staff", branchIds: [] };

describe("canManageUser", () => {
  it("never lets anyone edit themselves here", () => {
    expect(canManageUser(admin, { id: "a", role: "admin", branchIds: [] })).toBe(false);
  });
  it("only super admins manage super admins", () => {
    expect(canManageUser(admin, { id: "x", role: "super_admin", branchIds: [] })).toBe(false);
    expect(canManageUser(superA, { id: "x", role: "super_admin", branchIds: [] })).toBe(true);
  });
  it("branch-limited admins manage only users inside their branches", () => {
    expect(canManageUser(scoped, { id: "x", role: "staff", branchIds: [B1] })).toBe(true);
    expect(canManageUser(scoped, { id: "x", role: "staff", branchIds: [B1, B2] })).toBe(false);
    expect(canManageUser(scoped, { id: "x", role: "staff", branchIds: [] })).toBe(false);
  });
  it("staff manage nobody", () => {
    expect(canManageUser(staff, { id: "x", role: "staff", branchIds: [B1] })).toBe(false);
  });
});

describe("checkAssignableAccess", () => {
  it("blocks non-super-admins from creating super admins", () => {
    expect(checkAssignableAccess(admin, { role: "super_admin", branchIds: [] }, all)).toMatch(/super admin/);
    expect(checkAssignableAccess(superA, { role: "super_admin", branchIds: [] }, all)).toBeNull();
  });
  it("keeps branch-limited admins inside their branches", () => {
    expect(checkAssignableAccess(scoped, { role: "staff", branchIds: [] }, all)).not.toBeNull();
    expect(checkAssignableAccess(scoped, { role: "staff", branchIds: [B2] }, all)).not.toBeNull();
    expect(checkAssignableAccess(scoped, { role: "staff", branchIds: [B1] }, all)).toBeNull();
  });
  it("rejects unknown branches", () => {
    expect(checkAssignableAccess(admin, { role: "staff", branchIds: ["33333333-3333-4333-8333-333333333333"] }, all)).toBe("Unknown branch.");
  });
});

describe("normaliseAccess", () => {
  it("drops branches for super admins and permissions for admins", () => {
    expect(normaliseAccess({ role: "super_admin", branchIds: [B1], permissions: ["forms.edit"] })).toMatchObject({ branchIds: [], permissions: [] });
    expect(normaliseAccess({ role: "admin", branchIds: [B1], permissions: ["forms.edit"] })).toMatchObject({ branchIds: [B1], permissions: [] });
    expect(normaliseAccess({ role: "staff", branchIds: [B1], permissions: ["forms.edit", "forms.edit"] })).toMatchObject({ permissions: ["forms.edit"] });
  });
});
