"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { updateFormDetailsAction } from "../actions";

interface Values {
  name: string;
  description: string;
  branchId: string;
  slug: string;
}

export function FormDetailsForm({ form, branches, appUrl }: { form: Values & { id: string }; branches: { id: string; name: string }[]; appUrl: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, watch, setError, formState } = useForm<Values>({ defaultValues: form });
  const slug = watch("slug");

  const onSubmit = (values: Values) =>
    start(async () => {
      const res = await updateFormDetailsAction({ formId: form.id, ...values });
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof Values, { message: m });
        toast.error(res.error);
      }
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="d-name">Form Name</Label>
        <Input id="d-name" {...register("name", { required: "Form name is required", minLength: { value: 2, message: "Too short" } })} aria-invalid={!!formState.errors.name} />
        <FieldError message={formState.errors.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="d-desc">Description</Label>
        <Textarea id="d-desc" rows={3} {...register("description")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="d-branch">Branch</Label>
          <NativeSelect id="d-branch" {...register("branchId")}>
            <option value="">All branches / none</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label htmlFor="d-slug">URL slug</Label>
          <Input id="d-slug" {...register("slug", { pattern: { value: /^[a-z0-9]+(-[a-z0-9]+)*$/, message: "Lowercase letters, numbers and hyphens only" } })} aria-invalid={!!formState.errors.slug} />
          <FieldError message={formState.errors.slug?.message} />
        </div>
      </div>
      <p className="text-xs break-all text-muted-foreground">
        Public URL: {appUrl}/forms/{slug}
        {slug !== form.slug && <span className="block text-amber-700">Changing the slug breaks existing links and printed QR codes.</span>}
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !formState.isDirty}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save details
        </Button>
      </div>
    </form>
  );
}
