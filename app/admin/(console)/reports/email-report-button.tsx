"use client";

import { useTransition } from "react";
import { Loader2, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { emailReportNowAction } from "./actions";

export function EmailReportButton({ month }: { month: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await emailReportNowAction(month);
          if (res.ok) toast.success(res.message);
          else toast.error(res.error);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Mail />} Email report
    </Button>
  );
}
