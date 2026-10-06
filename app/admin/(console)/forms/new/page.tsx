import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { listBranchOptions } from "@/services/forms/admin";
import { CreateFormForm } from "./create-form";

export const metadata: Metadata = { title: "Create Form" };

export default async function NewFormPage() {
  const branches = await listBranchOptions();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Create New Form" description="Start with the basics — you'll add questions in the builder next." />
      <Card>
        <CardContent className="pt-6 sm:pt-6">
          <CreateFormForm branches={branches.filter((b) => b.status === "active")} />
        </CardContent>
      </Card>
    </div>
  );
}
