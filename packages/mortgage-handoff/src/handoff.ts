import { CreditAuditReport, MemberCreditProfile } from "@credit-orchestrator/fcra-rules-engine";

export interface HomeLoanHandoffPayload {
  borrowerId: string;
  firstName: string;
  lastName: string;
  email: string;
  walletAddress: string;
  firstTimeBuyer: boolean;
  creditScore: number;
  annualHouseholdIncome: number;
  monthlyDebtPayments: number;
  county: string;
  purchasePrice: number;
  loanAmount: number;
  isPrimaryResidence: boolean;
  attachmentType: "Attached" | "Detached";
  constructionMethod: "SiteBuilt" | "Manufactured";
}

export async function dispatchToHomeLoanOrchestrator(
  profile: MemberCreditProfile,
  audit: CreditAuditReport,
  housingTarget: {
    email: string;
    county: string;
    annualHouseholdIncome: number;
    purchasePrice: number;
    loanAmount: number;
  }
) {
  if (!audit.mortgageReady) {
    return {
      handedOff: false,
      reason: `Projected FICO (${audit.projectedFico}) is below the 640 IHCDA threshold. Execute dispute packets first.`
    };
  }

  const estimatedMonthlyDebt = profile.tradelines
    .filter((t) => t.status === "OPEN")
    .reduce((sum, t) => sum + Math.max(25, Math.round(t.balance * 0.03)), 0);

  const payload: HomeLoanHandoffPayload = {
    borrowerId: profile.memberId,
    firstName: profile.firstName,
    lastName: profile.lastName,
    email: housingTarget.email,
    walletAddress: profile.walletAddress,
    firstTimeBuyer: true,
    creditScore: audit.projectedFico,
    annualHouseholdIncome: housingTarget.annualHouseholdIncome,
    monthlyDebtPayments: estimatedMonthlyDebt,
    county: housingTarget.county,
    purchasePrice: housingTarget.purchasePrice,
    loanAmount: housingTarget.loanAmount,
    isPrimaryResidence: true,
    attachmentType: "Detached",
    constructionMethod: "SiteBuilt"
  };

  const gatewayUrl =
    process.env.HOME_LOAN_ORCHESTRATOR_URL || "http://localhost:4000/api/applications/originate";

  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      return { handedOff: false, reason: `Home Loan Gateway returned HTTP ${res.status}`, payload };
    }

    const originationResponse = await res.json();
    return { handedOff: true, payload, originationResponse };
  } catch {
    return {
      handedOff: false,
      reason: "Home Loan Gateway offline; payload prepared for manual dispatch.",
      payload
    };
  }
}
