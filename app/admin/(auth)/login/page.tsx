import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_authorized: "Your account does not have access to the admin console.",
  link_expired: "That link is invalid or has expired. Please request a new one.",
};

export default async function LoginPage(props: PageProps<"/admin/login">) {
  const sp = await props.searchParams;
  const next = typeof sp.next === "string" ? sp.next : undefined;
  const error = typeof sp.error === "string" ? ERRORS[sp.error] : undefined;
  return <LoginForm next={next} initialError={error} />;
}
