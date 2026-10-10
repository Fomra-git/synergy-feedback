import Link from "next/link";
import { FilePlus2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/admin/empty-state";
import { FormActionsMenu } from "@/components/admin/form-actions-menu";
import { FormStatusBadge } from "@/components/admin/status-badges";
import { formatNumber } from "@/lib/utils";
import { publicFormUrl } from "@/lib/urls";
import type { DashboardFormItem } from "@/services/forms/admin";
import type { FormMenuAccess } from "@/lib/auth/permissions";

/** Dashboard list of every active form with total / today response counts. */
export function FormsOverview({ forms, today, access }: { forms: DashboardFormItem[]; today: string; access: FormMenuAccess }) {
  return (
    <Card className="mb-6">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle>Forms</CardTitle>
          <CardDescription>Responses per form. Click a count to open those submissions.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/forms">Manage forms</Link>
        </Button>
      </CardHeader>
      <CardContent className="px-0 sm:px-0">
        {forms.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No Forms Yet"
            description="Create your first Synergy Wellness feedback form."
            action={<Button asChild><Link href="/admin/forms/new"><FilePlus2 /> Create Form</Link></Button>}
          />
        ) : (
          <div role="table" aria-label="Forms and response counts">
            <div role="row" className="hidden grid-cols-[minmax(0,1fr)_110px_110px_44px] items-center gap-3 border-y bg-muted/40 px-6 py-2 text-xs font-medium text-muted-foreground sm:grid">
              <span role="columnheader">Form</span>
              <span role="columnheader" className="text-right">Total</span>
              <span role="columnheader" className="text-right">Today</span>
              <span role="columnheader"><span className="sr-only">Actions</span></span>
            </div>
            <ul className="divide-y border-t sm:border-t-0" role="rowgroup">
              {forms.map((f) => {
                const submissions = `/admin/submissions?form=${f.id}`;
                return (
                  <li key={f.id} role="row" className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_110px_110px_44px] sm:px-6">
                    <div role="cell" className="min-w-0">
                      {access.edit ? (
                        <Link href={`/admin/forms/${f.id}`} className="block truncate text-sm font-medium hover:text-primary hover:underline">
                          {f.name}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-medium">{f.name}</p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <FormStatusBadge status={f.status} />
                        <span className="truncate">{f.branch?.name ?? "No branch"}</span>
                      </div>
                    </div>
                    {!access.submissions ? (
                      <>
                        <div role="cell" className="row-start-2 text-sm text-muted-foreground sm:row-start-auto sm:text-right">—</div>
                        <div role="cell" className="row-start-2 text-sm text-muted-foreground sm:row-start-auto sm:text-right">—</div>
                      </>
                    ) : (
                    <>
                    <div role="cell" className="row-start-2 flex items-baseline gap-1 text-sm sm:row-start-auto sm:justify-end">
                      <Link href={submissions} className="font-semibold tabular-nums hover:text-primary hover:underline" aria-label={`${formatNumber(f.total)} total submissions for ${f.name}`}>
                        {formatNumber(f.total)}
                      </Link>
                      <span className="text-xs text-muted-foreground sm:hidden">total</span>
                    </div>
                    <div role="cell" className="row-start-2 flex items-baseline gap-1 text-sm sm:row-start-auto sm:justify-end">
                      <Link
                        href={`${submissions}&from=${today}&to=${today}`}
                        className={f.today ? "font-semibold text-primary tabular-nums hover:underline" : "tabular-nums text-muted-foreground hover:underline"}
                        aria-label={`${formatNumber(f.today)} submissions today for ${f.name}`}
                      >
                        {formatNumber(f.today)}
                      </Link>
                      <span className="text-xs text-muted-foreground sm:hidden">today</span>
                    </div>
                    </>
                    )}
                    <div role="cell" className="col-start-2 row-start-1 justify-self-end sm:col-start-auto sm:row-start-auto">
                      <FormActionsMenu form={f} publicUrl={publicFormUrl(f.slug)} access={access} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
