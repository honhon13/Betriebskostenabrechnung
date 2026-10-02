import { Lock, Paperclip, Pencil, Plus, ReceiptText, Trash2 } from "lucide-react";
import type { Metadata } from "next";

import { createCostAction, deleteCostAction, updateCostAction } from "@/app/actions/billing";
import { can, getDataScope } from "@/auth/rbac";
import { CostFields } from "@/components/billing/cost-fields";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { FormDialog } from "@/components/forms/form-dialog";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState } from "@/components/ui/page";
import { formatCents, formatDate } from "@/lib/format";
import { listCosts } from "@/services/costs.service";
import { listAllocationKeys, listCategories, listUnits } from "@/services/masterdata.service";
import { loadPeriodPage } from "@/services/page-context";
import type { CostDto } from "@/types/billing";

export const metadata: Metadata = { title: "Kosten" };

export default async function CostsPage({ params }: PageProps<"/abrechnung/[jahr]/kosten">) {
  const { user, period } = await loadPeriodPage((await params).jahr);
  if (!can(user, "cost:read") || !getDataScope(user).allUnits) return <NoAccess />;

  const [costs, categories, allocationKeys, units] = await Promise.all([
    listCosts(user, period.id),
    listCategories(),
    listAllocationKeys(),
    listUnits(user),
  ]);

  const draft = period.status === "draft";
  const canWrite = draft && can(user, "cost:write");
  const canDelete = draft && can(user, "cost:delete");
  const unitName = new Map(units.map((unit) => [unit.id, unit.name]));
  const total = costs.reduce((acc, cost) => acc + cost.amountCents, 0);

  const columns: Column<CostDto>[] = [
    { key: "date", header: "Datum", cell: (cost) => formatDate(cost.costDate), className: "whitespace-nowrap" },
    {
      key: "position",
      header: "Position",
      mobile: false,
      cell: (cost) => (
        <>
          <span className="font-medium">{cost.description}</span>
          <span className="block text-xs text-muted">
            {[cost.categoryName, cost.supplier].filter(Boolean).join(" · ")}
          </span>
        </>
      ),
    },
    { key: "key", header: "Schlüssel", cell: (cost) => cost.allocationKeyName },
    {
      key: "units",
      header: "TOPs",
      cell: (cost) =>
        cost.unitIds.length === units.length ? (
          "Alle"
        ) : (
          <span className="inline-flex flex-wrap justify-end gap-1">
            {cost.unitIds.map((id) => (
              <Badge key={id}>{unitName.get(id)}</Badge>
            ))}
          </span>
        ),
    },
    {
      key: "receipts",
      header: "Belege",
      cell: (cost) =>
        cost.receiptCount > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Paperclip className="size-3.5 text-subtle" aria-hidden />
            {cost.receiptCount}
          </span>
        ) : (
          <span className="text-subtle">–</span>
        ),
    },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (cost) => <span className="font-medium">{formatCents(cost.amountCents)}</span>,
    },
  ];

  const createDialog = canWrite ? (
    <FormDialog
      trigger={
        <>
          <Plus aria-hidden />
          Kosten erfassen
        </>
      }
      triggerVariant="primary"
      title="Kosten erfassen"
      description={`Abrechnungsjahr ${period.year}`}
      action={createCostAction.bind(null, period.id)}
    >
      <CostFields categories={categories} allocationKeys={allocationKeys} units={units} />
    </FormDialog>
  ) : null;

  return (
    <div className="space-y-4">
      {!draft ? (
        <Alert tone="info" title="Diese Abrechnung ist freigegeben">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden />
            Kosten sind gesperrt. Nimm die Freigabe zurück, um sie zu ändern.
          </span>
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title="Kostenpositionen"
          description={`${costs.length} ${costs.length === 1 ? "Position" : "Positionen"} · ${formatCents(total)}`}
          action={createDialog}
        />
        {costs.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Noch keine Kosten"
            description="Erfasse Rechnungen und Vorschreibungen mit Kostenart, Betrag und Umlageschlüssel."
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption={`Kostenpositionen ${period.year}`}
              rows={costs}
              columns={columns}
              rowKey={(cost) => cost.id}
              mobileTitle={(cost) => (
                <>
                  {cost.description}
                  <span className="block text-xs font-normal text-muted">{cost.categoryName}</span>
                </>
              )}
              mobileValue={(cost) => formatCents(cost.amountCents)}
              actions={
                canWrite || canDelete
                  ? (cost) => (
                      <>
                        {canWrite ? (
                          <FormDialog
                            trigger={<Pencil aria-hidden />}
                            triggerVariant="ghost"
                            triggerSize="icon"
                            triggerLabel={`${cost.description} bearbeiten`}
                            title="Kosten bearbeiten"
                            action={updateCostAction.bind(null, cost.id)}
                          >
                            <CostFields
                              categories={categories}
                              allocationKeys={allocationKeys}
                              units={units}
                              cost={cost}
                            />
                          </FormDialog>
                        ) : null}
                        {canDelete ? (
                          <ConfirmAction
                            trigger={<Trash2 aria-hidden />}
                            triggerLabel={`${cost.description} löschen`}
                            title="Kostenposition löschen?"
                            description={
                              <>
                                „{cost.description}“ über {formatCents(cost.amountCents)} wird
                                gelöscht. Verknüpfte Belege bleiben erhalten.
                              </>
                            }
                            confirmLabel="Löschen"
                            destructive
                            action={deleteCostAction.bind(null, cost.id)}
                          />
                        ) : null}
                      </>
                    )
                  : undefined
              }
              footer={
                <tr className="font-semibold">
                  <td colSpan={5} className="px-3 py-2.5 pl-5">
                    Summe
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{formatCents(total)}</td>
                  {canWrite || canDelete ? <td /> : null}
                </tr>
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
