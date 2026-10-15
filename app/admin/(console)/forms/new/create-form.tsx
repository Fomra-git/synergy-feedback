"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { slugify } from "@/lib/utils";
import { createFormAction } from "../actions";
import { OTHERS_VALUE } from "@/lib/forms/others";

const schema = z.object({
  name: z.string().trim().min(2, "Form name is required").max(150),
  description: z.string().max(2000).optional(),
  branchId: z.string().optional(),
  otherName: z.string().trim().max(80).optional(),
  slug: z
    .string()
    .trim()
    .max(80)
    .refine((s) => s === "" || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s), "Use lowercase letters, numbers and hyphens")
    .optional(),
}).refine((v) => v.branchId !== OTHERS_VALUE || (v.otherName ?? "").length >= 2, {
  path: ["otherName"],
  message: "Enter a name for this group (at least 2 characters)",
});
type Values = z.infer<typeof schema>;

export function CreateFormForm({ branches, allowOthers }: { branches: { id: string; name: string }[]; allowOthers: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [slugTouched, setSlugTouched] = useState(false);
  const { register, handleSubmit, setValue, watch, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", branchId: branches[0]?.id ?? "", otherName: "", slug: "" },
  });
  const slug = watch("slug");
  const isOthers = watch("branchId") === OTHERS_VALUE;

  const onSubmit = (values: Values) =>
    start(async () => {
      // An auto-filled slug is only a suggestion: let the server make it unique.
      const res = await createFormAction({ ...values, otherName: values.branchId === OTHERS_VALUE ? values.otherName : undefined, slug: slugTouched ? values.slug : "", status: "draft" });
      if (res.ok) {
        toast.success("Form created");
        router.push(`/admin/forms/${res.data.id}/builder`);
      } else toast.error(res.error);
    });

  const e = formState.errors;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="name">Form Name</Label>
        <Input
          id="name"
          placeholder="Patient Feedback"
          aria-invalid={!!e.name}
          {...register("name", {
            onChange: (ev) => {
              if (!slugTouched) setValue("slug", slugify(ev.target.value));
            },
          })}
        />
        <FieldError message={e.name?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} placeholder="Your feedback helps us improve our physiotherapy services." {...register("description")} />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="branchId">Branch</Label>
          <NativeSelect id="branchId" {...register("branchId")}>
            <option value="">All branches / none</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
            {allowOthers && <option value={OTHERS_VALUE}>Others</option>}
          </NativeSelect>
          {isOthers && (
            <div className="space-y-2 pt-1">
              <Label htmlFor="otherName">Name</Label>
              <Input id="otherName" placeholder="e.g. Recruitment, Events, Corporate wellness" autoFocus aria-invalid={!!e.otherName} {...register("otherName")} />
              <FieldError message={e.otherName?.message} />
              <p className="text-xs text-muted-foreground">Not linked to any branch and not included in Reports.</p>
            </div>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="slug">URL slug</Label>
          <Input id="slug" placeholder="patient-feedback" aria-invalid={!!e.slug} {...register("slug", { onChange: () => setSlugTouched(true) })} />
          <p className="text-xs text-muted-foreground">/forms/{slug || "auto-generated"}</p>
          <FieldError message={e.slug?.message} />
        </div>
      </div>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
        New forms start as <strong>Draft</strong>. Publish when you are ready to share the public link. Slugs are made unique automatically.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Create & open builder <ArrowRight />
        </Button>
      </div>
    </form>
  );
}
