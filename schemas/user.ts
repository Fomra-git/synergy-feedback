import { z } from "zod";
import { PERMISSION_KEYS } from "@/lib/auth/permissions";

export const userPasswordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200)
  .regex(/[A-Za-z]/, "Include at least one letter")
  .regex(/\d/, "Include at least one number");

const access = {
  role: z.enum(["super_admin", "admin", "staff"]),
  /** Empty = all branches. */
  branchIds: z.array(z.uuid()).max(200),
  permissions: z.array(z.enum(PERMISSION_KEYS as [string, ...string[]])).max(20),
};

export const userCreateSchema = z
  .object({
    email: z.email("Enter a valid email address").max(254).transform((e) => e.trim().toLowerCase()),
    fullName: z.string().trim().min(2, "Enter the person's name").max(120),
    ...access,
    method: z.enum(["invite", "password"]),
    password: z.string().max(200).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.method === "password") {
      const r = userPasswordSchema.safeParse(d.password ?? "");
      if (!r.success) ctx.addIssue({ code: "custom", path: ["password"], message: r.error.issues[0]!.message });
    }
  });

export const userUpdateSchema = z.object({
  userId: z.uuid(),
  fullName: z.string().trim().min(2).max(120),
  isActive: z.boolean(),
  ...access,
});

export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserUpdateInput = z.input<typeof userUpdateSchema>;
