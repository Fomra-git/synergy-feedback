"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { columnLetter } from "@/lib/google/a1";
import type { SheetColumn } from "@/types/db";

function sourceLabel(col: SheetColumn): string {
  if (col.key.startsWith("field:")) return col.key.slice(6);
  if (col.key.startsWith("legacy:")) return "Existing column (kept)";
  return "System";
}

/** Optional mapping UI: Form Field → Google Sheet column header. */
export function FieldMapping({ columns, onSave }: { columns: SheetColumn[]; onSave: (headers: Record<string, string>) => Promise<void> }) {
  const [headers, setHeaders] = useState<Record<string, string>>(() => Object.fromEntries(columns.map((c) => [c.key, c.header])));
  const [pending, start] = useTransition();
  const dirty = columns.some((c) => headers[c.key] !== c.header);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Field mapping</CardTitle>
        <CardDescription>
          Columns are mapped automatically. Rename a Google Sheet column here if you prefer a different header. Columns for removed fields are kept so historical data is never lost.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground uppercase">
                <th className="py-2 pr-3 font-semibold">Col</th>
                <th className="py-2 pr-3 font-semibold">Form Field</th>
                <th aria-hidden />
                <th className="py-2 font-semibold">Google Sheet Column</th>
              </tr>
            </thead>
            <tbody>
              {columns.map((c, i) => (
                <tr key={c.key} className="border-b last:border-0">
                  <td className="py-2 pr-3 font-mono text-xs text-muted-foreground">{columnLetter(i)}</td>
                  <td className="py-2 pr-3">
                    <span className="font-mono text-xs">{sourceLabel(c)}</span>
                  </td>
                  <td className="px-1 text-muted-foreground" aria-hidden>
                    <ArrowRight className="size-4" />
                  </td>
                  <td className="py-2">
                    <Input
                      aria-label={`Sheet column header for ${sourceLabel(c)}`}
                      className="h-8 min-w-48 text-sm"
                      value={headers[c.key] ?? ""}
                      disabled={c.key.startsWith("legacy:")}
                      onChange={(e) => setHeaders((h) => ({ ...h, [c.key]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 flex justify-end">
          <Button disabled={!dirty || pending} onClick={() => start(() => onSave(headers))}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save mapping
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
