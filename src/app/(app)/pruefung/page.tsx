import { ClipboardCheck, Pencil, Trash2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { deleteCostAction } from "@/app/actions/billing";
import { deleteDocumentAction } from "@/app/actions/documents";
import { deletePaymentAction } from "@/app/actions/payments";
import { reviewAction } from "@/app/actions/review";
import { requireUser } from "@/auth/current-user";
import { can } from "@/auth/rbac";
import { CreditBadge } from "@/components/billing/credit-badge";
import { DocumentChips } from "@/components/documents/document-preview";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { ReviewBadge } from "@/components/review/review-badge";
import { ReviewDialog } from "@/components/review/review-dialog";
import { Badge } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { NoAccess } from "@/components/ui/no-access";
import { EmptyState, PageHeader } from "@/components/ui/page";
import { formatCents, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  countPendingReviews,
  listReviewItems,
  type ReviewItem,
  type ReviewKind,
} from "@/services/review.service";
import type { ReviewStatus } from "@/types/billing";

export const metadata: Metadata = { title: "Prüfung" };

const KIND_LABELS: Record<ReviewKind, string> = {
  period: "Abrechnungsjahr",
  cost: "Kosten",
  payment: "Einzahlung",
  document: "Dokument",
};

/** Filter in der URL: /pruefung?status=abgelehnt */
const FILTERS: { param: string; status: ReviewStatus; label: string }[] = [
  { param: "ausstehend", status: "pending", label: "Ausstehend" },
  { param: "abgelehnt", status: "rejected", label: "Abgelehnt" },
  { param: "freigegeben", status: "approved", label: "Freigegeben" },
];

/** Wo sich der Eintrag bearbeiten lässt. */
function editHref(item: ReviewItem): string {
  if (item.kind === "cost") return `/abrechnung/${item.year}/kosten?position=${item.id}`;
  if (item.kind === "payment") return `/einzahlungen?jahr=${item.year}`;
  if (item.kind === "document") {
    return `/dokumente?jahr=${item.year}&q=${encodeURIComponent(item.title)}`;
  }
  return `/abrechnung/${item.year}`;
}

/**
 * Prüfliste der Verwaltung: von Benutzern eingereichte Einträge ansehen, freigeben,
 * ablehnen, bearbeiten oder löschen.
 */
export default async function ReviewPage({ searchParams }: PageProps<"/pruefung">) {
  const user = await requireUser();
  if (!can(user, "review:manage")) return <NoAccess />;

  const { status: statusParam } = await searchParams;
  const filter = FILTERS.find((f) => f.param === statusParam) ?? FILTERS[0];
  const [items, pendingCount] = await Promise.all([
    listReviewItems(user, filter.status),
    countPendingReviews(user),
  ]);

  const deleteAction = (item: ReviewItem) =>
    item.kind === "cost" && can(user, "cost:delete")
      ? deleteCostAction.bind(null, item.id)
      : item.kind === "payment" && can(user, "payment:delete")
        ? deletePaymentAction.bind(null, item.id)
        : item.kind === "document" && can(user, "document:delete")
          ? deleteDocumentAction.bind(null, item.id)
          : null;

  const columns: Column<ReviewItem>[] = [
    {
      key: "kind",
      header: "Art",
      cell: (item) => (
        <>
          {/* Eine eingereichte Gutschrift ist eine Kostenposition mit negativem Betrag. */}
          {item.credit ? <CreditBadge /> : <Badge tone="primary">{KIND_LABELS[item.kind]}</Badge>}
          <span className="mt-1 block text-xs text-muted">Jahr {item.year}</span>
        </>
      ),
    },
    {
      key: "entry",
      header: "Eintrag",
      mobile: false,
      className: "md:min-w-48",
      cell: (item) => (
        <div className="space-y-1">
          <p className="font-medium wrap-anywhere">{item.title}</p>
          {item.detail ? <p className="text-xs text-muted">{item.detail}</p> : null}
          {item.documents.length > 0 ? <DocumentChips documents={item.documents} /> : null}
        </div>
      ),
    },
    {
      key: "submitted",
      header: "Eingereicht",
      cell: (item) => (
        <>
          {item.submittedBy ?? "–"}
          <span className="block text-xs whitespace-nowrap text-muted">
            {formatDateTime(item.submittedAt)}
          </span>
        </>
      ),
    },
    {
      key: "review",
      header: "Status",
      cell: (item) => (
        <div className="space-y-1">
          <ReviewBadge status={item.reviewStatus} />
          {item.reviewedAt ? (
            <p className="text-xs whitespace-nowrap text-muted">
              geprüft am {formatDateTime(item.reviewedAt)}
            </p>
          ) : null}
          {item.reviewComment ? (
            <p className="max-w-56 text-xs break-words text-muted">„{item.reviewComment}“</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "amount",
      header: "Betrag",
      align: "right",
      mobile: false,
      cell: (item) =>
        item.amountCents === null ? (
          <span className="text-subtle">–</span>
        ) : (
          <span className="font-medium">{formatCents(item.amountCents)}</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prüfung"
        description="Von TOP 1 und TOP 3 eingereichte Einträge zählen erst nach deiner Freigabe."
      />

      <nav aria-label="Prüfstand" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.param}
            href={`/pruefung?status=${f.param}`}
            aria-current={f === filter ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              f === filter
                ? "border-primary bg-primary-soft text-primary"
                : "border-border-strong bg-surface text-muted hover:text-foreground",
            )}
          >
            {f.label}
            {f.status === "pending" && pendingCount > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
                {pendingCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>

      <Card>
        <CardHeader
          title={`${filter.label} – ${items.length} ${items.length === 1 ? "Eintrag" : "Einträge"}`}
          description={
            filter.status === "pending"
              ? "Älteste Einreichung zuerst. Belege lassen sich direkt in der Vorschau öffnen; mit einer Kostenposition oder Einzahlung werden ihre Belege mit freigegeben."
              : filter.status === "rejected"
                ? "Abgelehnte Einträge zählen nicht. Sie lassen sich nachträglich freigeben oder löschen."
                : "Von dir geprüfte und freigegebene Einträge."
          }
        />
        {items.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title={filter.status === "pending" ? "Nichts zu prüfen" : "Keine Einträge"}
            description={
              filter.status === "pending"
                ? "Es wartet kein eingereichter Eintrag auf deine Prüfung."
                : "In diesem Stand gibt es keine Einträge."
            }
          />
        ) : (
          <div className="pt-3">
            <DataTable
              caption="Eingereichte Einträge"
              rows={items}
              columns={columns}
              rowKey={(item) => `${item.kind}-${item.id}`}
              mobileTitle={(item) => (
                <>
                  <span className="wrap-anywhere">{item.title}</span>
                  {item.detail ? (
                    <span className="block text-xs font-normal text-muted">{item.detail}</span>
                  ) : null}
                </>
              )}
              mobileValue={(item) =>
                item.amountCents === null ? null : formatCents(item.amountCents)
              }
              actions={(item) => {
                const remove = deleteAction(item);
                return (
                  <>
                    {item.reviewStatus !== "approved" ? (
                      <ReviewDialog
                        decision="approved"
                        subject={item.title}
                        comment={item.reviewComment}
                        action={reviewAction.bind(null, item.kind, item.id)}
                      />
                    ) : null}
                    {item.reviewStatus !== "rejected" ? (
                      <ReviewDialog
                        decision="rejected"
                        subject={item.title}
                        comment={item.reviewComment}
                        action={reviewAction.bind(null, item.kind, item.id)}
                      />
                    ) : null}
                    <Link
                      href={editHref(item)}
                      className={buttonClass("ghost", "icon")}
                      aria-label={`${item.title} bearbeiten`}
                      title="Bearbeiten"
                    >
                      <Pencil aria-hidden />
                    </Link>
                    {remove ? (
                      <ConfirmAction
                        trigger={<Trash2 aria-hidden />}
                        triggerLabel={`${item.title} löschen`}
                        title="Eintrag löschen?"
                        description={<>„{item.title}“ wird endgültig gelöscht.</>}
                        confirmLabel="Löschen"
                        destructive
                        action={remove}
                      />
                    ) : null}
                  </>
                );
              }}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
