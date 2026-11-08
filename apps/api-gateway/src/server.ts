import express, { Request, Response } from "express";
import { auditCreditProfile, MemberCreditProfile } from "@credit-orchestrator/fcra-rules-engine";
import { generateBureauDisputePackets } from "@credit-orchestrator/dispute-generator";
import { calculateOptimalPayoffPlan } from "@credit-orchestrator/debt-optimizer";
import { dispatchToHomeLoanOrchestrator } from "@credit-orchestrator/mortgage-handoff";

const app = express();
app.use(express.json());

// Full pipeline: Audit Credit -> Generate FCRA Letters -> Optimize LUCR Paydown -> Handoff to Home Loan Repo
app.post("/api/credit/rehabilitate", async (req: Request, res: Response) => {
  const { profile, availablePaydownBudgetUsd = 500, housingTarget } = req.body as {
    profile: MemberCreditProfile;
    availablePaydownBudgetUsd?: number;
    housingTarget?: {
      email: string;
      county: string;
      annualHouseholdIncome: number;
      purchasePrice: number;
      loanAmount: number;
    };
  };

  const audit = auditCreditProfile(profile);
  const disputePackets = generateBureauDisputePackets(profile, audit.disputeFlags);
  const payoffPlan = calculateOptimalPayoffPlan(profile.tradelines, availablePaydownBudgetUsd);

  let mortgageHandoff = null;
  if (housingTarget) {
    mortgageHandoff = await dispatchToHomeLoanOrchestrator(profile, audit, housingTarget);
  }

  res.status(200).json({
    audit,
    disputePackets,
    payoffPlan,
    mortgageHandoff
  });
});

const PORT = Number(process.env.PORT) || 4100;
app.listen(PORT, () => {
  console.log(`Credit Repair Orchestrator API running on port ${PORT}`);
});
