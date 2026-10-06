"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ConsoleError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card px-6 py-16 text-center">
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-destructive">
        <AlertTriangle className="size-6" aria-hidden />
      </div>
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">We couldn&apos;t load this page. The problem has been logged.</p>
      <Button onClick={reset} variant="outline" className="mt-5">
        <RotateCcw /> Try again
      </Button>
    </div>
  );
}
