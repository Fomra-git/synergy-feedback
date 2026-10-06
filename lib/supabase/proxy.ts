import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

/**
 * Refreshes the Supabase session cookie on every matched request and blocks
 * unauthenticated access to /admin. Fine-grained role checks happen again on
 * the server (layouts, actions, route handlers) — this is a first gate only.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getClaims() validates the JWT; do not run code between client creation and this call.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const path = request.nextUrl.pathname;
  const isAdminArea = path.startsWith("/admin");
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

  if (isAdminArea && !isPublicAdminPath && !user) {
    const login = request.nextUrl.clone();
    login.pathname = "/admin/login";
    login.search = "";
    if (path !== "/admin") login.searchParams.set("next", path);
    const redirect = NextResponse.redirect(login);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  if (path === "/admin/login" && user) {
    const dash = request.nextUrl.clone();
    dash.pathname = "/admin/dashboard";
    dash.search = "";
    const redirect = NextResponse.redirect(dash);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }

  return response;
}
