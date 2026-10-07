/**
 * Public links (forms, QR codes, emails, OAuth) must be built from the site
 * origin only. Any path accidentally included in NEXT_PUBLIC_APP_URL (e.g.
 * ".../admin/dashboard") is dropped so links never point inside the admin.
 */
export function siteOrigin(value: string | undefined): string {
  const fallback = "http://localhost:3000";
  if (!value) return fallback;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
  } catch {
    return fallback;
  }
}
