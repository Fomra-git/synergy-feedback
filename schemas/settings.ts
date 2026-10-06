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
  }),
  email: z.object({
    senderName: z.string().trim().max(80),
    senderEmail: z.union([z.email(), z.literal("")]),
    defaultRecipients: z.array(z.email()).max(20),
  }),
  security: z.object({
    captchaEnabled: z.boolean(),
    submissionRateLimitPerMinute: z.number().int().min(1).max(600),
    submissionRateLimitPerHour: z.number().int().min(1).max(10000),
  }),
  timezone: z.string().trim().min(1).max(64),
});

export type AppSettings = z.infer<typeof appSettingsSchema>;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  organization: { name: "Synergy Wellness", email: "", website: "", logoUrl: "" },
  branding: { primaryColor: "#0f766e", secondaryColor: "#f59e0b", logoUrl: "" },
  email: { senderName: "Synergy Feedback", senderEmail: "", defaultRecipients: [] },
  security: { captchaEnabled: false, submissionRateLimitPerMinute: 10, submissionRateLimitPerHour: 60 },
  timezone: "Asia/Kolkata",
};
