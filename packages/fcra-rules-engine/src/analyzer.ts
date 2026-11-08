export type Bureau = "EQUIFAX" | "EXPERIAN" | "TRANSUNION";

export interface Tradeline {
  accountId: string;
  creditorName: string;
  originalCreditor?: string;
  accountType: "REVOLVING" | "INSTALLMENT" | "COLLECTION" | "MEDICAL";
  balance: number;
  creditLimit: number;
  apr: number;
  status: "OPEN" | "CLOSED" | "CHARGE_OFF" | "COLLECTION" | "PAID";
  dateOfFirstDelinquency: string | null;
  bureausReporting: Bureau[];
}

export interface MemberCreditProfile {
  memberId: string;
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  ssnLast4: string;
  currentFico: number;
  walletAddress: string;
  tradelines: Tradeline[];
}

export interface DisputeFlag {
  accountId: string;
  creditorName: string;
  violationCode: string;
  legalBasis: string;
  reason: string;
  targetBureaus: Bureau[];
  estimatedScoreGain: number;
}

export interface CreditAuditReport {
  memberId: string;
  currentFico: number;
  projectedFico: number;
  mortgageReady: boolean;
  overallUtilizationPct: number;
  disputeFlags: DisputeFlag[];
  utilizationTargets: { accountId: string; creditorName: string; paydownNeeded: number }[];
}

export function auditCreditProfile(profile: MemberCreditProfile): CreditAuditReport {
  const flags: DisputeFlag[] = [];
  const utilizationTargets: { accountId: string; creditorName: string; paydownNeeded: number }[] = [];
  const now = new Date();
  const sevenYearsMs = 7 * 365.25 * 24 * 60 * 60 * 1000;

  let totalRevolvingBalance = 0;
  let totalRevolvingLimit = 0;
  const seenOriginalCreditors = new Set<string>();

  for (const item of profile.tradelines) {
    // 1. Check 7-Year Obsolescence (15 U.S.C. § 1681c(a)(4))
    if (item.dateOfFirstDelinquency) {
      const dofd = new Date(item.dateOfFirstDelinquency);
      if (now.getTime() - dofd.getTime() > sevenYearsMs && item.status !== "OPEN") {
        flags.push({
          accountId: item.accountId,
          creditorName: item.creditorName,
          violationCode: "FCRA_605_OBSOLETE_DEBT",
          legalBasis: "15 U.S.C. § 1681c(a)(4)",
          reason: `Account exceeds the statutory 7-year reporting window from DOFD (${item.dateOfFirstDelinquency}).`,
          targetBureaus: item.bureausReporting,
          estimatedScoreGain: 28
        });
      }
    }

    // 2. Check Medical Collections under $500 (NCRA Bureau Policy)
    if (item.accountType === "MEDICAL" && item.balance > 0 && item.balance < 500) {
      flags.push({
        accountId: item.accountId,
        creditorName: item.creditorName,
        violationCode: "MEDICAL_UNDER_500_EXCLUSION",
        legalBasis: "Equifax/Experian/TransUnion Medical Debt Exclusion Standard",
        reason: `Unpaid medical collection under $500 ($${item.balance}) is ineligible for credit report inclusion.`,
        targetBureaus: item.bureausReporting,
        estimatedScoreGain: 22
      });
    }

    // 3. Check Duplicate Collection Reporting (15 U.S.C. § 1681e(b))
    if (item.status === "COLLECTION" && item.originalCreditor) {
      const key = `${item.originalCreditor.toUpperCase()}_${Math.round(item.balance)}`;
      if (seenOriginalCreditors.has(key)) {
        flags.push({
          accountId: item.accountId,
          creditorName: item.creditorName,
          violationCode: "FCRA_607B_DUPLICATE_COLLECTION",
          legalBasis: "15 U.S.C. § 1681e(b)",
          reason: `Duplicate collection tradeline for original creditor ${item.originalCreditor}.`,
          targetBureaus: item.bureausReporting,
          estimatedScoreGain: 25
        });
      }
      seenOriginalCreditors.add(key);
    }

    // 4. Track Revolving Utilization
    if (item.accountType === "REVOLVING" && item.status === "OPEN" && item.creditLimit > 0) {
      totalRevolvingBalance += item.balance;
      totalRevolvingLimit += item.creditLimit;

      const targetMaxBalance = item.creditLimit * 0.29;
      if (item.balance > targetMaxBalance) {
        utilizationTargets.push({
          accountId: item.accountId,
          creditorName: item.creditorName,
          paydownNeeded: Number((item.balance - targetMaxBalance).toFixed(2))
        });
      }
    }
  }

  const overallUtilizationPct =
    totalRevolvingLimit > 0 ? Number(((totalRevolvingBalance / totalRevolvingLimit) * 100).toFixed(2)) : 0;

  const disputeGain = flags.reduce((sum, f) => sum + f.estimatedScoreGain, 0);
  const utilizationGain = overallUtilizationPct > 30 ? Math.min(35, Math.round((overallUtilizationPct - 29) * 0.8)) : 0;
  const projectedFico = Math.min(850, profile.currentFico + disputeGain + utilizationGain);

  return {
    memberId: profile.memberId,
    currentFico: profile.currentFico,
    projectedFico,
    mortgageReady: projectedFico >= 640,
    overallUtilizationPct,
    disputeFlags: flags,
    utilizationTargets
  };
}
