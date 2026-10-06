import { redirect } from "next/navigation";

/** The root has no public content: patients use /forms/[slug], staff use /admin. */
export default function Home() {
  redirect("/admin/dashboard");
}
