import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function FieldError({ id, message, className }: { id?: string; message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={cn("flex items-start gap-1.5 text-sm text-destructive", className)}>
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
