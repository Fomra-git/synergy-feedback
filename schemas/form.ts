import { z } from "zod";
import { FIELD_TYPES } from "@/types/forms";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f766e");
const optionalText = (max: number) => z.string().trim().max(max).optional();
const safeUrl = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => s === "" || /^https?:\/\//i.test(s), "URL must start with http:// or https://")
  .optional();

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Slug must be at least 2 characters")
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens");

export const logicSchema = z
  .object({
    action: z.enum(["show", "hide"]),
    match: z.enum(["all", "any"]),
    conditions: z
      .array(
        z.object({
          fieldId: z.string().max(64),
          operator: z.enum([
            "equals",
            "not_equals",
            "contains",
            "not_contains",
            "is_empty",
            "is_not_empty",
            "greater_than",
            "less_than",
          ]),
          value: z.string().max(500).optional(),
        }),
      )
      .max(10),
  })
  .nullable()
  .optional();

export const fieldSchema = z.object({
  field_id: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/, "Invalid field key"),
  type: z.enum(FIELD_TYPES),
  label: z.string().max(500),
  description: z.string().max(5000).nullable().optional(),
  placeholder: z.string().max(300).nullable().optional(),
  required: z.boolean(),
  settings: z
    .object({
      options: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
      helpText: optionalText(500),
      defaultValue: optionalText(1000),
      hidden: z.boolean().optional(),
      max: z.number().int().min(1).max(100).optional(),
      min: z.number().int().min(0).max(99).optional(),
      minLabel: optionalText(60),
      maxLabel: optionalText(60),
      maxFiles: z.number().int().min(1).max(10).optional(),
      maxSizeMb: z.number().int().min(1).max(10).optional(),
      accept: z.array(z.enum(["image", "pdf", "document"])).optional(),
      level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      width: z.enum(["full", "half"]).optional(),
      prefillParam: z
        .string()
        .regex(/^[a-zA-Z0-9_-]{0,40}$/)
        .optional(),
    })
    .strip(),
  validation: z
    .object({
      minLength: z.number().int().min(0).max(10000).optional(),
      maxLength: z.number().int().min(1).max(10000).optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().max(300).optional(),
      patternMessage: z.string().max(200).optional(),
    })
    .strip(),
  logic: logicSchema,
});

export const builderSaveSchema = z
  .object({
    formId: z.uuid(),
    expectedVersion: z.number().int().positive().nullable(),
    fields: z.array(fieldSchema).max(200),
  })
  .superRefine((data, ctx) => {
    const ids = new Set<string>();
    data.fields.forEach((f, i) => {
      if (ids.has(f.field_id)) {
        ctx.addIssue({ code: "custom", message: `Duplicate field key "${f.field_id}"`, path: ["fields", i, "field_id"] });
      }
      ids.add(f.field_id);
    });
  });

export const formCreateSchema = z.object({
  name: z.string().trim().min(2, "Form name is required").max(150),
  description: z.string().trim().max(2000).optional().default(""),
  branchId: z.union([z.uuid(), z.literal("")]).optional(),
  slug: z.union([slugSchema, z.literal("")]).optional(),
  status: z.enum(["draft", "published"]).default("draft"),
});

export const formDetailsSchema = z.object({
  formId: z.uuid(),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional().default(""),
  branchId: z.union([z.uuid(), z.literal("")]).optional(),
  slug: slugSchema,
});

export const publicSettingsSchema = z.object({
  appearance: z
    .object({
      primaryColor: hexColor.optional(),
      backgroundColor: hexColor.optional(),
      buttonColor: hexColor.optional(),
      font: z.enum(["inter", "serif", "rounded", "system"]).optional(),
      logoUrl: safeUrl,
    })
    .default({}),
  behavior: z
    .object({
      showProgressBar: z.boolean().optional(),
      submitButtonText: optionalText(60),
      successTitle: optionalText(120),
      successMessage: optionalText(1000),
      showSubmissionNumber: z.boolean().optional(),
      redirectUrl: safeUrl,
      successButtonText: optionalText(60),
      successButtonUrl: safeUrl,
    })
    .default({}),
  seo: z
    .object({
      title: optionalText(120),
      description: optionalText(300),
    })
    .default({}),
});

export const privateSettingsSchema = z.object({
  submission: z.object({
    allowSubmissions: z.boolean(),
    duplicateProtection: z.boolean(),
    maxSubmissions: z.number().int().min(1).max(10_000_000).nullable().optional(),
    closeAt: z.string().datetime({ offset: true }).nullable().optional(),
    closedMessage: optionalText(500),
  }),
  notifications: z.object({
    enabled: z.boolean(),
    recipients: z.array(z.email()).max(20),
    subject: optionalText(200),
    includeAnswers: z.boolean(),
  }),
  google_sheets: z.object({
    includeFormName: z.boolean(),
    includeBranch: z.boolean(),
    includeUserAgent: z.boolean(),
    includeIpHash: z.boolean(),
  }),
});

export type BuilderSaveInput = z.infer<typeof builderSaveSchema>;
export type PublicSettingsInput = z.infer<typeof publicSettingsSchema>;
export type PrivateSettingsInput = z.infer<typeof privateSettingsSchema>;
