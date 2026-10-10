import { z } from "zod";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex colour like #0f766e");
const url = z
  .string()
  .trim()
  .max(2000)
  .refine((s) => s === "" || /^https?:\/\//i.test(s), "URL must start with http:// or https://");

export const appSettingsSchema = z.object({
  organization: z.object({
    name: z.string().trim().min(2).max(120),
    email: z.union([z.email(), z.literal("")]),
    website: url,
    logoUrl: url,
  }),
  branding: z.object({
    primaryColor: hexColor,
    secondaryColor: hexColor,
    logoUrl: url,
    /** Global form appearance, used by every form with "Apply global settings" on. */
    formDefaults: z.object({
      primaryColor: hexColor,
      backgroundColor: hexColor,
      buttonColor: hexColor,
      /** Background of the title banner at the top of each form. */
      headerColor: hexColor,
      font: z.enum(["inter", "serif", "rounded", "system"]),
      /** Optional: replaces each form's own title when set. */
      title: z.string().trim().max(150),
      /** Optional: replaces each form's own description when set. */
      description: z.string().trim().max(2000),
    }),
  }),
  email: z.object({
    senderName: z.string().trim().max(80),
    senderEmail: z.union([z.email(), z.literal("")]),
    /** Emailed about every submission, on every form. */
    defaultRecipients: z.array(z.email()).max(20),
    /** Branch id → addresses emailed about submissions for that branch. */
    branchRecipients: z.record(z.uuid(), z.array(z.email()).max(20)),
  }),
  security: z.object({
    captchaEnabled: z.boolean(),
    submissionRateLimitPerMinute: z.number().int().min(1).max(600),
    submissionRateLimitPerHour: z.number().int().min(1).max(10000),
  }),
  timezone: z.string().trim().min(1).max(64),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;
export type GlobalFormDefaults = AppSettings["branding"]["formDefaults"];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  organization: { name: "Synergy Wellness", email: "", website: "", logoUrl: "" },
  branding: {
    primaryColor: "#0f766e",
    secondaryColor: "#f59e0b",
    logoUrl: "",
    formDefaults: {
      primaryColor: "#0f766e",
      backgroundColor: "#f0fdfa",
      buttonColor: "#0f766e",
      headerColor: "#1e2749",
      font: "inter",
      title: "",
      description: "",
    },
  },
  email: { senderName: "Synergy Feedback", senderEmail: "", defaultRecipients: [], branchRecipients: {} },
  security: { captchaEnabled: false, submissionRateLimitPerMinute: 10, submissionRateLimitPerHour: 60 },
  timezone: "Asia/Kolkata",
};
