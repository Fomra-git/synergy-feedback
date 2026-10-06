"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Loader2, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FieldError } from "@/components/ui/field-error";
import { saveBranchAction } from "./actions";

export interface BranchValues {
  id?: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  managerName: string;
  status: "active" | "inactive";
}

const EMPTY: BranchValues = { name: "", code: "", address: "", phone: "", email: "", managerName: "", status: "active" };

export function BranchFormDialog({ branch, trigger }: { branch?: BranchValues; trigger?: "button" | "icon" }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const { register, handleSubmit, reset, setError, formState } = useForm<BranchValues>({ defaultValues: branch ?? EMPTY });
  const e = formState.errors;

  const onSubmit = (values: BranchValues) =>
    start(async () => {
      const res = await saveBranchAction({ ...values, id: branch?.id });
      if (res.ok) {
        toast.success(res.message);
        setOpen(false);
        if (!branch) reset(EMPTY);
        router.refresh();
      } else {
        for (const [k, m] of Object.entries(res.fieldErrors ?? {})) setError(k as keyof BranchValues, { message: m });
        toast.error(res.error);
      }
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger === "icon" ? (
          <Button variant="outline" size="sm"><Pencil /> Edit</Button>
        ) : (
          <Button><Plus /> Add Branch</Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{branch ? "Edit branch" : "Add branch"}</DialogTitle>
          <DialogDescription>Branches group forms and submissions by clinic location.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="b-name">Branch Name</Label>
              <Input id="b-name" {...register("name", { required: "Branch name is required" })} aria-invalid={!!e.name} />
              <FieldError message={e.name?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-code">Branch Code</Label>
              <Input id="b-code" placeholder="ANN" className="uppercase" {...register("code", { required: "Code is required" })} aria-invalid={!!e.code} />
              <FieldError message={e.code?.message} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="b-address">Address</Label>
            <Textarea id="b-address" rows={2} {...register("address")} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="b-phone">Phone</Label>
              <Input id="b-phone" type="tel" {...register("phone")} aria-invalid={!!e.phone} />
              <FieldError message={e.phone?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-email">Email</Label>
              <Input id="b-email" type="email" {...register("email")} aria-invalid={!!e.email} />
              <FieldError message={e.email?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-manager">Manager Name</Label>
              <Input id="b-manager" {...register("managerName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="b-status">Status</Label>
              <NativeSelect id="b-status" {...register("status")}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />} {branch ? "Save changes" : "Create branch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
