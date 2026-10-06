import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { formatNumber } from "@/lib/utils";

export function SyncStatusTiles({ counts }: { counts: { synced: number; pending: number; processing: number; failed: number } }) {
  const items = [
    { label: "Synced", value: counts.synced, icon: CheckCircle2, cls: "text-emerald-700 bg-emerald-50" },
    { label: "Pending", value: counts.pending + counts.processing, icon: Clock, cls: "text-amber-700 bg-amber-50" },
    { label: "Failed", value: counts.failed, icon: AlertTriangle, cls: "text-red-700 bg-red-50" },
  ];
  return (
    <ul className="grid grid-cols-3 gap-3">
      {items.map((i) => (
        <li key={i.label} className="rounded-lg border p-3">
          <span className={`mb-2 inline-flex size-7 items-center justify-center rounded-md ${i.cls}`}>
            <i.icon className="size-4" aria-hidden />
          </span>
          <p className="text-xl font-semibold tabular-nums">{formatNumber(i.value)}</p>
          <p className="text-xs text-muted-foreground">{i.label}</p>
        </li>
      ))}
    </ul>
  );
}
