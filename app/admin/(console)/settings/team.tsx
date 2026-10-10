"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";

export function ProfileForm({ fullName }: { fullName: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateProfileAction({ fullName: name });
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="p-name">Full name</Label>
        <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save
      </Button>
    </form>
  );
}
