import { z } from "zod";

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const branchSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, "Branch name is required").max(120),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9_-]{1,19}$/, "2–20 characters: letters, numbers, - or _"),
  address: optional(500),
  phone: z
    .string()
    .trim()
    .max(30)
    .refine((v) => v === "" || /^\+?[0-9\s\-().]{7,25}$/.test(v), "Enter a valid phone number")
    .optional()
    .transform((v) => (v ? v : null)),
  email: z
    .union([z.email("Enter a valid email"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  managerName: optional(120),
  status: z.enum(["active", "inactive"]).default("active"),
});

export type BranchInput = z.input<typeof branchSchema>;
