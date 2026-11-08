import { Bureau, DisputeFlag, MemberCreditProfile } from "@credit-orchestrator/fcra-rules-engine";

const BUREAU_ADDRESSES: Record<Bureau, string> = {
  EQUIFAX: "Equifax Information Services LLC, P.O. Box 740256, Atlanta, GA 30374",
  EXPERIAN: "Experian, P.O. Box 4500, Allen, TX 75013",
  TRANSUNION: "TransUnion Consumer Solutions, P.O. Box 2000, Chester, PA 19016"
};

export interface GeneratedDisputePacket {
  bureau: Bureau;
  mailingAddress: string;
  disputedAccountsCount: number;
  letterText: string;
}

export function generateBureauDisputePackets(
  profile: MemberCreditProfile,
  flags: DisputeFlag[]
): GeneratedDisputePacket[] {
  const bureaus: Bureau[] = ["EQUIFAX", "EXPERIAN", "TRANSUNION"];
  const today = new Date().toISOString().split("T")[0];
  const packets: GeneratedDisputePacket[] = [];

  for (const bureau of bureaus) {
    const bureauFlags = flags.filter((f) => f.targetBureaus.includes(bureau));
    if (bureauFlags.length === 0) continue;

    const itemBlocks = bureauFlags
      .map(
        (flag, idx) =>
          `${idx + 1}. Creditor: ${flag.creditorName} (Account ID: ${flag.accountId})
   Violation Code: ${flag.violationCode} (${flag.legalBasis})
   Demand: ${flag.reason} Pursuant to 15 U.S.C. § 1681i, reinvestigate and permanently delete this inaccurate/obsolete item within 30 days.`
      )
      .join("\n\n");

    const letterText = `Date: ${today}
To: ${BUREAU_ADDRESSES[bureau]}

From:
${profile.firstName} ${profile.lastName}
${profile.address}
${profile.city}, ${profile.state} ${profile.zip}
SSN (Last 4): XXX-XX-${profile.ssnLast4}

RE: Formal Notice of Dispute Under the Fair Credit Reporting Act (15 U.S.C. § 1681i)

To Whom It May Concern:

I am exercising my statutory right under the Fair Credit Reporting Act to dispute inaccurate, unverified, or obsolete information appearing on my ${bureau} consumer credit file.

Please investigate and delete the following disputed tradelines:

${itemBlocks}

Under 15 U.S.C. § 1681i(a)(1), you are required to conduct a reasonable reinvestigation within 30 days of receipt of this notice and provide me with an updated copy of my consumer disclosure reflecting the deletions.

Sincerely,

${profile.firstName} ${profile.lastName}`;

    packets.push({
      bureau,
      mailingAddress: BUREAU_ADDRESSES[bureau],
      disputedAccountsCount: bureauFlags.length,
      letterText
    });
  }

  return packets;
}
