/**
 * Shared money math for deal aggregations.
 *
 * Headline dollar figures across the app count only DISCLOSED deal values:
 *   • records flagged isEstimated (capacity-based benchmark estimates) count as 0
 *   • cancelled / decommissioned projects count as 0
 * Individual deal rows still display their own values (estimates marked "est.").
 */

type DealLike = {
  dealSizeUsdMn?: number | null;
  isEstimated?: boolean;
  dealStage?: string | null;
  status?: string | null;
};

export function isCancelledDeal(p: DealLike | null | undefined): boolean {
  if (!p) return false;
  const s = `${p.dealStage ?? ""} ${p.status ?? ""}`.toLowerCase();
  return s.includes("cancelled") || s.includes("decommissioned");
}

/** Dollar value (USD millions) a deal contributes to aggregate totals. */
export function disclosedUsdMn(p: DealLike | null | undefined): number {
  if (!p || p.isEstimated === true || isCancelledDeal(p)) return 0;
  return p.dealSizeUsdMn ?? 0;
}
