import { Tradeline } from "@credit-orchestrator/fcra-rules-engine";

export interface PayoffAllocation {
  accountId: string;
  creditorName: string;
  currentBalance: number;
  recommendedUsdPayment: number;
  lucrTokensRequired: number;
  priorityReason: string;
}

export function calculateOptimalPayoffPlan(
  tradelines: Tradeline[],
  availableBudgetUsd: number,
  lucrUsdPegRate = 1.0
): PayoffAllocation[] {
  const activeDebts = tradelines
    .filter((t) => t.balance > 0 && t.status !== "PAID")
    .map((t) => {
      const utilization = t.creditLimit > 0 ? t.balance / t.creditLimit : 0;
      // Prioritize revolving lines >30% utilization first for immediate FICO boost, then highest APR (Avalanche)
      const priorityScore = utilization > 0.3 ? 1000 + utilization * 100 : t.apr;
      return { ...t, utilization, priorityScore };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  let remainingBudget = availableBudgetUsd;
  const allocations: PayoffAllocation[] = [];

  for (const debt of activeDebts) {
    if (remainingBudget <= 0) break;

    const targetPayment =
      debt.accountType === "REVOLVING" && debt.utilization > 0.29
        ? Math.min(debt.balance, Number((debt.balance - debt.creditLimit * 0.29).toFixed(2)))
        : debt.balance;

    const payment = Math.min(remainingBudget, Math.max(25, targetPayment));
    remainingBudget = Number((remainingBudget - payment).toFixed(2));

    allocations.push({
      accountId: debt.accountId,
      creditorName: debt.creditorName,
      currentBalance: debt.balance,
      recommendedUsdPayment: payment,
      lucrTokensRequired: Number((payment / lucrUsdPegRate).toFixed(4)),
      priorityReason:
        debt.utilization > 0.3
          ? `Drops revolving utilization from ${(debt.utilization * 100).toFixed(0)}% to 29% for rapid FICO gain`
          : `Highest APR (${debt.apr}%) debt avalanche target`
    });
  }

  return allocations;
}
