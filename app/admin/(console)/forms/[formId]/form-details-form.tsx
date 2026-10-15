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
import { OTHERS_VALUE } from "@/lib/forms/others";

interface Values {
  name: string;
  description: string;
  branchId: string;
  otherName: string;
  slug: string;
}

export function FormDetailsForm({
  form,
  branches,
  appUrl,
  allowOthers,
}: {
  form: Values & { id: string };
  branches: { id: string; name: string }[];
  appUrl: string;
  allowOthers: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const { register, handleSubmit, watch, setError, formState } = useForm<Values>({ defaultValues: form });
  const slug = watch("slug");
  const isOthers = watch("branchId") === OTHERS_VALUE;

  const onSubmit = (values: Values) =>
    start(async () => {
      const res = await updateFormDetailsAction({ formId: form.id, ...values, otherName: values.branchId === OTHERS_VALUE ? values.otherName : undefined });
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
            {(allowOthers || form.branchId === OTHERS_VALUE) && <option value={OTHERS_VALUE}>Others</option>}
          </NativeSelect>
          {isOthers && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="d-other">Name</Label>
              <Input
                id="d-other"
                placeholder="e.g. Recruitment, Events"
                aria-invalid={!!formState.errors.otherName}
                {...register("otherName", { validate: (v) => !isOthers || v.trim().length >= 2 || "Enter a name for this group (at least 2 characters)" })}
              />
              <FieldError message={formState.errors.otherName?.message} />
              <p className="text-xs text-muted-foreground">Not linked to any branch and not included in Reports.</p>
            </div>
          )}
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
