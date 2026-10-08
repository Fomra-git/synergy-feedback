import { redirect } from "next/navigation";

/** No public home page: the site root opens the staff login (signed-in users go on to the dashboard). */
export default function Home() {
  redirect("/admin/login");
}
