const BRANDING_MARKER = "/storage/v1/object/public/branding/";

/**
 * Logos uploaded to Supabase Storage are served through this app
 * (/api/logo/…) so they load from our own origin — independent of the image
 * Content-Security-Policy and of which Supabase URL the site was built with.
 * Other URLs are returned unchanged.
 */
export function logoSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  const i = url.indexOf(BRANDING_MARKER);
  if (i === -1) return url;
  return `/api/logo/${url.slice(i + BRANDING_MARKER.length).split("?")[0]}`;
}
