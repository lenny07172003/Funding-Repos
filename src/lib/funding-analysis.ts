"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";
import { generateStackingBlueprint, type StackingBlueprint } from "./stacking-engine";
import { matchLendingProducts, type BusinessProfile, type LendingMatch } from "./revenue-lending-engine";

// ─── Helpers ───

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

async function getSubAccountId(): Promise<string> {
  const user = await getSession();
  if (!user.subAccountId) {
    if (user.agencyId) {
      const first = await prisma.subAccount.findFirst({
        where: { agencyId: user.agencyId },
        orderBy: { createdAt: "asc" },
      });
      if (first) return first.id;
    }
    throw new Error("No sub-account found");
  }
  return user.subAccountId;
}

// ─── Types ───

interface CreditBureauData {
  score: number | null;
  accounts: number | null;
  creditAge: string;
  derogatoryAccounts: number | null;
  highestCreditLimit: number | null;
  inquiries: number | null;
}

interface CreditProfile {
  experian: CreditBureauData;
  equifax: CreditBureauData;
  transUnion: CreditBureauData;
}

interface FundingPhase {
  phase: number;
  name: string;
  timing: string;
  products: FundingProduct[];
  totalProjected: number;
  rationale: string;
}

interface FundingProduct {
  type: string;
  typeLabel: string;
  lenderMatch: string;
  projectedAmount: number;
  approvalLikelihood: "high" | "medium" | "low";
  requirements: string;
  notes: string;
}

interface RiskFactor {
  severity: "high" | "medium" | "low";
  factor: string;
  recommendation: string;
}

interface Improvement {
  priority: "high" | "medium" | "low";
  action: string;
  impact: string;
  timeframe: string;
}

// ─── Credit-Based Funding Analysis ───

export async function runCreditBasedAnalysis(clientId: string) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
    include: { fundingApplications: true },
  });
  if (!client) throw new Error("Client not found");

  // Parse credit profile
  let cp: CreditProfile;
  try {
    cp = JSON.parse(client.creditProfile || "{}");
  } catch {
    throw new Error("No credit profile data available. Enter credit scores first.");
  }

  const scores = {
    experian: cp.experian?.score,
    equifax: cp.equifax?.score,
    transUnion: cp.transUnion?.score,
  };

  const avgScore = getAverageScore(scores);
  if (!avgScore) {
    throw new Error("At least one credit score is required to run analysis.");
  }

  // Get lenders for matching
  const lenders = await prisma.lender.findMany({ where: { subAccountId } });

  // Build input snapshot
  const inputSnapshot = {
    type: "credit_based",
    scores,
    avgScore,
    accounts: {
      experian: cp.experian?.accounts,
      equifax: cp.equifax?.accounts,
      transUnion: cp.transUnion?.accounts,
    },
    creditAge: cp.experian?.creditAge || cp.equifax?.creditAge || cp.transUnion?.creditAge || "",
    derogatoryAccounts: Math.max(
      cp.experian?.derogatoryAccounts || 0,
      cp.equifax?.derogatoryAccounts || 0,
      cp.transUnion?.derogatoryAccounts || 0
    ),
    highestCreditLimit: Math.max(
      cp.experian?.highestCreditLimit || 0,
      cp.equifax?.highestCreditLimit || 0,
      cp.transUnion?.highestCreditLimit || 0
    ),
    inquiries: {
      experian: cp.experian?.inquiries,
      equifax: cp.equifax?.inquiries,
      transUnion: cp.transUnion?.inquiries,
    },
    businessName: client.businessName,
    businessAge: client.businessAge,
    annualRevenue: client.annualRevenue,
    entityType: client.entityType,
    existingFunding: client.totalFunded,
    lenderCount: lenders.length,
  };

  // Generate analysis
  const phases = generateCreditBasedPhases(avgScore, cp, lenders, client);
  const riskFactors = identifyRiskFactors(avgScore, cp, client);
  const improvements = generateImprovements(avgScore, cp, client);
  const totalProjected = phases.reduce((sum, p) => sum + p.totalProjected, 0);

  const summary = generateCreditSummary(avgScore, phases, riskFactors);

  // Save analysis
  const analysis = await prisma.fundingAnalysis.create({
    data: {
      clientId,
      type: "credit_based",
      status: "completed",
      inputSnapshot: JSON.stringify(inputSnapshot),
      summary,
      phases: JSON.stringify(phases),
      totalProjected,
      recommendedFirst: phases[0]?.products[0]?.typeLabel || "Review credit profile",
      riskFactors: JSON.stringify(riskFactors),
      improvements: JSON.stringify(improvements),
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return analysis;
}

// ─── Revenue-Based Funding Analysis ───

export async function runRevenueBasedAnalysis(clientId: string) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
    include: { fundingApplications: true },
  });
  if (!client) throw new Error("Client not found");

  if (!client.annualRevenue) {
    throw new Error("Annual revenue is required for revenue-based analysis.");
  }

  const revenue = parseFloat(client.annualRevenue.replace(/[^0-9.]/g, "")) || 0;
  if (revenue <= 0) {
    throw new Error("Valid annual revenue is required.");
  }

  const lenders = await prisma.lender.findMany({ where: { subAccountId } });

  let cp: CreditProfile | null = null;
  try {
    cp = JSON.parse(client.creditProfile || "{}");
  } catch {}
  const avgScore = cp ? getAverageScore({
    experian: cp.experian?.score,
    equifax: cp.equifax?.score,
    transUnion: cp.transUnion?.score,
  }) : null;

  const inputSnapshot = {
    type: "revenue_based",
    annualRevenue: revenue,
    monthlyRevenue: revenue / 12,
    businessName: client.businessName,
    businessAge: client.businessAge,
    entityType: client.entityType,
    avgCreditScore: avgScore,
    existingFunding: client.totalFunded,
  };

  const phases = generateRevenueBasedPhases(revenue, client, avgScore, lenders);
  const riskFactors = identifyRevenueRiskFactors(revenue, client);
  const improvements = generateRevenueImprovements(revenue, client);
  const totalProjected = phases.reduce((sum, p) => sum + p.totalProjected, 0);
  const summary = generateRevenueSummary(revenue, phases, totalProjected);

  const analysis = await prisma.fundingAnalysis.create({
    data: {
      clientId,
      type: "revenue_based",
      status: "completed",
      inputSnapshot: JSON.stringify(inputSnapshot),
      summary,
      phases: JSON.stringify(phases),
      totalProjected,
      recommendedFirst: phases[0]?.products[0]?.typeLabel || "Review business financials",
      riskFactors: JSON.stringify(riskFactors),
      improvements: JSON.stringify(improvements),
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return analysis;
}

// ─── Credit Card Stacking Analysis (uses real card database) ───

export async function runStackingAnalysis(
  clientId: string,
  creditReportData: import("./stacking-engine").CreditReportData
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
  });
  if (!client) throw new Error("Client not found");

  // Run the stacking engine with parsed credit report data
  const blueprint = await generateStackingBlueprint(creditReportData);

  // Save as a funding analysis record
  const analysis = await prisma.fundingAnalysis.create({
    data: {
      clientId,
      type: "credit_stacking",
      status: "completed",
      inputSnapshot: JSON.stringify({
        type: "credit_stacking",
        ...creditReportData,
      }),
      summary: blueprint.summary,
      phases: JSON.stringify(blueprint.phases),
      totalProjected: blueprint.totalProjectedMax,
      recommendedFirst: blueprint.phases[0]?.steps[0]?.cardName || "Review credit profile",
      riskFactors: JSON.stringify(blueprint.disqualifyReasons.map((r) => ({
        severity: "high",
        factor: r,
        recommendation: r,
      }))),
      improvements: JSON.stringify([]),
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { analysis, blueprint };
}

// ─── Get analyses for a client ───

// ─── Revenue-Based Lending Analysis (for clients below 680 or with strong revenue) ───

export async function runRevenueLendingAnalysis(
  clientId: string,
  businessProfile: BusinessProfile
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
  });
  if (!client) throw new Error("Client not found");

  const { matches, crossSellCreditRepair, creditRepairMessage } = await matchLendingProducts(businessProfile);

  const qualifiedMatches = matches.filter((m) => m.qualifies);
  const totalProjected = qualifiedMatches.length > 0
    ? qualifiedMatches.reduce((max, m) => Math.max(max, m.estimatedAmount.max), 0)
    : 0;

  // Build summary
  let summary = `${qualifiedMatches.length} lending product(s) matched out of ${matches.length} analyzed. `;
  if (qualifiedMatches.length > 0) {
    summary += `Top match: ${qualifiedMatches[0].product.name} — estimated $${qualifiedMatches[0].estimatedAmount.min.toLocaleString()}-$${qualifiedMatches[0].estimatedAmount.max.toLocaleString()}. `;
    summary += `Funding speed: ${qualifiedMatches[0].product.fundingSpeed}. `;
  }
  if (crossSellCreditRepair) {
    summary += `CREDIT REPAIR RECOMMENDED: ${creditRepairMessage}`;
  }

  // Save as a funding analysis record
  const analysis = await prisma.fundingAnalysis.create({
    data: {
      clientId,
      type: "revenue_lending",
      status: "completed",
      inputSnapshot: JSON.stringify(businessProfile),
      summary,
      phases: JSON.stringify(matches.map((m) => ({
        productName: m.product.name,
        productType: m.product.type,
        qualifies: m.qualifies,
        matchScore: m.matchScore,
        estimatedAmount: m.estimatedAmount,
        rate: `${m.product.typicalRateMin}-${m.product.typicalRateMax}${m.product.rateType === "factor_rate" ? "x factor" : m.product.rateType === "percentage_of_revenue" ? "% of revenue" : "% APR"}`,
        term: `${m.product.typicalTermMin}-${m.product.typicalTermMax} months`,
        fundingSpeed: m.product.fundingSpeed,
        documentation: m.product.documentationType,
        missingRequirements: m.missingRequirements,
        matchReasons: m.matchReasons,
        pros: m.product.pros,
        cons: m.product.cons,
        bestFor: m.product.bestFor,
      }))),
      totalProjected,
      recommendedFirst: qualifiedMatches[0]?.product.name || "Credit repair recommended",
      riskFactors: JSON.stringify(crossSellCreditRepair ? [{
        severity: "high",
        factor: "Credit score below 680 — credit repair recommended",
        recommendation: creditRepairMessage,
      }] : []),
      improvements: JSON.stringify([]),
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { analysis, matches, crossSellCreditRepair, creditRepairMessage };
}

/**
 * Send a stacking blueprint to the client via email.
 * The admin triggers this — includes a confirmation step in the UI.
 */
export async function sendBlueprintToClient(analysisId: string) {
  const subAccountId = await getSubAccountId();

  const analysis = await prisma.fundingAnalysis.findUnique({
    where: { id: analysisId },
    include: { client: true },
  });
  if (!analysis) throw new Error("Analysis not found");
  if (analysis.client.subAccountId !== subAccountId) throw new Error("Forbidden");

  const clientEmail = analysis.client.email;
  if (!clientEmail) throw new Error("Client has no email address on file.");

  const clientName = `${analysis.client.firstName} ${analysis.client.lastName}`.trim() || "Client";

  // Send via Resend
  const { Resend } = await import("resend");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");

  const resend = new Resend(apiKey);
  const phases = JSON.parse(analysis.phases || "[]");

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Funding CRM <onboarding@resend.dev>",
    to: [clientEmail],
    subject: "Your Funding Blueprint is Ready",
    html: buildBlueprintEmail(clientName, analysis.summary, phases, analysis.totalProjected),
  });

  if (error) throw new Error(`Failed to send: ${error.message}`);

  return { success: true, sentTo: clientEmail };
}

function buildBlueprintEmail(name: string, summary: string, phases: any[], totalProjected: number): string {
  const phaseRows = phases.map((p: any) => {
    const cards = (p.steps || []).map((s: any) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${s.cardName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;text-transform:capitalize;">${s.bureau}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#374151;">${s.timing}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#059669;">
          ${s.projectedLimitMin && s.projectedLimitMax ? `$${s.projectedLimitMin.toLocaleString()}-$${s.projectedLimitMax.toLocaleString()}` : "TBD"}
        </td>
      </tr>`
    ).join("");

    return `
      <tr><td colspan="4" style="padding:16px 12px 8px;font-size:16px;font-weight:700;color:#1e40af;background:#eff6ff;">
        Phase ${p.phase}: ${p.name} — ${p.timing}
      </td></tr>
      <tr><td colspan="4" style="padding:4px 12px 12px;font-size:13px;color:#6b7280;background:#eff6ff;">${p.rationale}</td></tr>
      ${cards}
    `;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">Your Funding Blueprint</h1>
<p style="color:#bfdbfe;font-size:14px;margin:8px 0 0;">Personalized Credit Card Stacking Plan</p>
</td></tr>
<tr><td style="padding:32px 40px;">
<p style="color:#374151;font-size:16px;">Hi <strong>${name}</strong>,</p>
<p style="color:#6b7280;font-size:15px;line-height:1.6;">${summary}</p>
<p style="color:#059669;font-size:20px;font-weight:700;margin:20px 0;">Projected Total: $${totalProjected.toLocaleString()}</p>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:20px 0;">
<tr style="background:#f9fafb;">
<th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">Card</th>
<th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">Bureau</th>
<th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">Timing</th>
<th style="padding:10px 12px;text-align:left;font-size:13px;color:#6b7280;font-weight:600;">Projected</th>
</tr>
${phaseRows}
</table>
<p style="color:#9ca3af;font-size:13px;margin-top:24px;">Your funding representative will guide you through each phase. Do not apply to any cards without first consulting with your representative.</p>
</td></tr>
<tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
<p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">This is a personalized funding strategy. Results may vary. Do not share this document.</p>
</td></tr>
</table></td></tr></table></body></html>`;
}

export async function getClientAnalyses(clientId: string) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({ where: { id: clientId, subAccountId } });
  if (!client) throw new Error("Client not found");

  return prisma.fundingAnalysis.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── Analysis Logic (Deterministic — no LLM needed) ───

function getAverageScore(scores: { experian: number | null | undefined; equifax: number | null | undefined; transUnion: number | null | undefined }): number | null {
  const valid = [scores.experian, scores.equifax, scores.transUnion].filter((s): s is number => s != null && s > 0);
  if (valid.length === 0) return null;
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
}

function getScoreTier(score: number): "excellent" | "good" | "fair" | "poor" {
  if (score >= 740) return "excellent";
  if (score >= 670) return "good";
  if (score >= 580) return "fair";
  return "poor";
}

const PRODUCT_LABELS: Record<string, string> = {
  credit_card: "Business Credit Card",
  line_of_credit: "Business Line of Credit",
  term_loan: "Term Loan",
  mca: "Merchant Cash Advance",
  equipment_financing: "Equipment Financing",
  sba: "SBA Loan",
};

function generateCreditBasedPhases(
  avgScore: number,
  cp: CreditProfile,
  lenders: any[],
  client: any
): FundingPhase[] {
  const tier = getScoreTier(avgScore);
  const phases: FundingPhase[] = [];
  const maxInquiries = Math.max(
    cp.experian?.inquiries || 0,
    cp.equifax?.inquiries || 0,
    cp.transUnion?.inquiries || 0
  );

  // Phase 1: Immediate opportunities based on current score
  const phase1Products: FundingProduct[] = [];

  if (tier === "excellent" || tier === "good") {
    // High-limit business credit cards first (soft pull or bureau-specific)
    phase1Products.push({
      type: "credit_card",
      typeLabel: "Business Credit Card Stack",
      lenderMatch: matchLenders(lenders, "credit_card", avgScore),
      projectedAmount: tier === "excellent" ? 75000 : 40000,
      approvalLikelihood: tier === "excellent" ? "high" : "medium",
      requirements: `Credit score ${avgScore}+ across bureaus`,
      notes: `Apply to ${tier === "excellent" ? "4-6" : "2-4"} cards strategically across bureaus. Space applications 1-2 days apart. Target cards that pull from bureau with highest score.`,
    });

    if (avgScore >= 680) {
      phase1Products.push({
        type: "line_of_credit",
        typeLabel: "Business Line of Credit",
        lenderMatch: matchLenders(lenders, "line_of_credit", avgScore),
        projectedAmount: tier === "excellent" ? 100000 : 50000,
        approvalLikelihood: tier === "excellent" ? "high" : "medium",
        requirements: `${avgScore}+ score, 2+ years in business preferred`,
        notes: "Apply after credit card approvals are reported. Credit utilization should be below 30%.",
      });
    }
  } else if (tier === "fair") {
    phase1Products.push({
      type: "credit_card",
      typeLabel: "Secured/Starter Business Credit Cards",
      lenderMatch: matchLenders(lenders, "credit_card", avgScore),
      projectedAmount: 15000,
      approvalLikelihood: "medium",
      requirements: `Score ${avgScore}, may require secured deposit`,
      notes: "Start with 2-3 cards. Build utilization history for 3-6 months before Phase 2.",
    });
  } else {
    phase1Products.push({
      type: "credit_card",
      typeLabel: "Credit Builder Cards",
      lenderMatch: "Secured card issuers",
      projectedAmount: 5000,
      approvalLikelihood: "high",
      requirements: "Secured deposit required, any credit score",
      notes: "Focus on building credit history. Report to all 3 bureaus. Keep utilization under 10%.",
    });
  }

  phases.push({
    phase: 1,
    name: tier === "excellent" || tier === "good" ? "Credit Card Stacking" : "Credit Building Foundation",
    timing: "Immediately",
    products: phase1Products,
    totalProjected: phase1Products.reduce((s, p) => s + p.projectedAmount, 0),
    rationale: tier === "excellent" || tier === "good"
      ? "Maximize credit card approvals while scores are fresh and inquiry count is low."
      : "Build credit foundation before applying for larger funding products.",
  });

  // Phase 2: After Phase 1 reports (30-90 days)
  const phase2Products: FundingProduct[] = [];

  if (tier === "excellent" || tier === "good") {
    phase2Products.push({
      type: "term_loan",
      typeLabel: "Term Loan",
      lenderMatch: matchLenders(lenders, "term_loan", avgScore),
      projectedAmount: tier === "excellent" ? 150000 : 75000,
      approvalLikelihood: "medium",
      requirements: `Strong credit profile, 2+ years business, revenue documentation`,
      notes: "Apply after credit card limits are established and showing on reports. Banks want to see existing credit relationships.",
    });

    if (client.annualRevenue && parseFloat(client.annualRevenue.replace(/[^0-9.]/g, "")) >= 100000) {
      phase2Products.push({
        type: "sba",
        typeLabel: "SBA Loan",
        lenderMatch: matchLenders(lenders, "sba", avgScore),
        projectedAmount: 250000,
        approvalLikelihood: avgScore >= 700 ? "medium" : "low",
        requirements: "680+ score, 2+ years, profitable, clean tax returns",
        notes: "Longest process (60-90 days) but best rates. Start application early in Phase 2.",
      });
    }
  } else if (tier === "fair") {
    phase2Products.push({
      type: "line_of_credit",
      typeLabel: "Business Line of Credit",
      lenderMatch: matchLenders(lenders, "line_of_credit", avgScore),
      projectedAmount: 25000,
      approvalLikelihood: "medium",
      requirements: "Improved score from Phase 1, revenue documentation",
      notes: "Score should have improved from Phase 1 activity. Target fintech lenders with lower score requirements.",
    });
  }

  if (phase2Products.length > 0) {
    phases.push({
      phase: 2,
      name: tier === "poor" ? "Growth Products" : "Term Funding & SBA",
      timing: tier === "poor" ? "6-12 months after Phase 1" : "60-90 days after Phase 1",
      products: phase2Products,
      totalProjected: phase2Products.reduce((s, p) => s + p.projectedAmount, 0),
      rationale: "After Phase 1 credit lines are established, leverage the stronger profile for larger funding products.",
    });
  }

  // Phase 3: Scale (if applicable)
  if (tier === "excellent" || tier === "good") {
    const phase3Products: FundingProduct[] = [];
    phase3Products.push({
      type: "equipment_financing",
      typeLabel: "Equipment Financing / Asset-Based",
      lenderMatch: matchLenders(lenders, "equipment_financing", avgScore),
      projectedAmount: 100000,
      approvalLikelihood: "medium",
      requirements: "Established credit relationships from Phase 1 & 2",
      notes: "Equipment serves as collateral, improving approval odds. Good for expanding operations.",
    });

    phases.push({
      phase: 3,
      name: "Scale & Expansion",
      timing: "6-12 months after Phase 1",
      products: phase3Products,
      totalProjected: phase3Products.reduce((s, p) => s + p.projectedAmount, 0),
      rationale: "With an established funding track record, pursue larger asset-based and expansion funding.",
    });
  }

  return phases;
}

function generateRevenueBasedPhases(
  revenue: number,
  client: any,
  avgScore: number | null,
  lenders: any[]
): FundingPhase[] {
  const monthlyRevenue = revenue / 12;
  const phases: FundingPhase[] = [];

  // Phase 1: Revenue-based immediate funding
  const phase1Products: FundingProduct[] = [];

  if (monthlyRevenue >= 10000) {
    phase1Products.push({
      type: "line_of_credit",
      typeLabel: "Revenue-Based Line of Credit",
      lenderMatch: matchLenders(lenders, "line_of_credit", avgScore || 600),
      projectedAmount: Math.min(monthlyRevenue * 3, 250000),
      approvalLikelihood: monthlyRevenue >= 25000 ? "high" : "medium",
      requirements: `$${Math.round(monthlyRevenue).toLocaleString()}/mo revenue, 6+ months bank statements`,
      notes: "Revenue-based lenders prioritize cash flow over credit score. Approval based on average monthly deposits.",
    });
  }

  if (monthlyRevenue >= 5000) {
    phase1Products.push({
      type: "mca",
      typeLabel: "Merchant Cash Advance / Revenue Advance",
      lenderMatch: matchLenders(lenders, "mca", avgScore || 500),
      projectedAmount: Math.min(monthlyRevenue * 1.5, 150000),
      approvalLikelihood: "high",
      requirements: `$${Math.round(monthlyRevenue).toLocaleString()}/mo revenue, 3+ months in business`,
      notes: "Fastest funding option (1-3 days). Higher cost but minimal credit requirements. Use strategically for short-term needs.",
    });
  }

  if (phase1Products.length > 0) {
    phases.push({
      phase: 1,
      name: "Revenue-Based Quick Funding",
      timing: "Immediately (1-7 days)",
      products: phase1Products,
      totalProjected: phase1Products.reduce((s, p) => s + p.projectedAmount, 0),
      rationale: "Leverage strong revenue to access funding quickly while building credit profile in parallel.",
    });
  }

  // Phase 2: Longer-term revenue products
  const phase2Products: FundingProduct[] = [];

  if (revenue >= 150000) {
    phase2Products.push({
      type: "term_loan",
      typeLabel: "Revenue-Based Term Loan",
      lenderMatch: matchLenders(lenders, "term_loan", avgScore || 600),
      projectedAmount: Math.min(revenue * 0.3, 500000),
      approvalLikelihood: revenue >= 250000 ? "high" : "medium",
      requirements: `$${revenue.toLocaleString()} annual revenue, 1+ year in business, bank statements`,
      notes: "Better rates than MCA. 6-60 month terms. Apply after establishing a track record with Phase 1 funding.",
    });
  }

  if (revenue >= 500000) {
    phase2Products.push({
      type: "sba",
      typeLabel: "SBA 7(a) Loan",
      lenderMatch: matchLenders(lenders, "sba", avgScore || 650),
      projectedAmount: Math.min(revenue * 0.5, 500000),
      approvalLikelihood: avgScore && avgScore >= 680 ? "medium" : "low",
      requirements: "Strong revenue, 2+ years, profitable operations",
      notes: "Best rates available. Long process but worth pursuing with this revenue level.",
    });
  }

  if (phase2Products.length > 0) {
    phases.push({
      phase: 2,
      name: "Growth Capital",
      timing: "30-60 days",
      products: phase2Products,
      totalProjected: phase2Products.reduce((s, p) => s + p.projectedAmount, 0),
      rationale: "With established revenue history, access larger capital at better terms.",
    });
  }

  return phases;
}

function matchLenders(lenders: any[], productType: string, minScore: number): string {
  const matches = lenders.filter((l) => {
    try {
      const products = JSON.parse(l.supportedProducts || "[]");
      const supportsProduct = products.includes(productType);
      const meetsScore = !l.minCreditScore || l.minCreditScore <= minScore;
      return supportsProduct && meetsScore;
    } catch {
      return false;
    }
  });

  if (matches.length > 0) {
    return matches.slice(0, 3).map((l: any) => l.name).join(", ");
  }
  return "Add lenders to marketplace for personalized matching";
}

function identifyRiskFactors(avgScore: number, cp: CreditProfile, client: any): RiskFactor[] {
  const risks: RiskFactor[] = [];
  const maxDerogatories = Math.max(
    cp.experian?.derogatoryAccounts || 0,
    cp.equifax?.derogatoryAccounts || 0,
    cp.transUnion?.derogatoryAccounts || 0
  );
  const maxInquiries = Math.max(
    cp.experian?.inquiries || 0,
    cp.equifax?.inquiries || 0,
    cp.transUnion?.inquiries || 0
  );

  if (avgScore < 580) {
    risks.push({ severity: "high", factor: "Credit score below 580", recommendation: "Focus on credit repair before pursuing funding. Consider credit repair referral." });
  } else if (avgScore < 670) {
    risks.push({ severity: "medium", factor: `Credit score ${avgScore} limits options`, recommendation: "Target fintech lenders and revenue-based products while building score." });
  }

  if (maxDerogatories > 0) {
    risks.push({ severity: maxDerogatories > 2 ? "high" : "medium", factor: `${maxDerogatories} derogatory account(s) on file`, recommendation: "Dispute inaccurate items. Consider credit repair program for faster resolution." });
  }

  if (maxInquiries > 5) {
    risks.push({ severity: "medium", factor: `${maxInquiries} recent inquiries`, recommendation: "Wait 3-6 months before new applications to let inquiry impact fade." });
  }

  if (!client.businessAge || client.businessAge.includes("0") || client.businessAge.includes("new")) {
    risks.push({ severity: "medium", factor: "New or young business", recommendation: "Some lenders require 2+ years. Target startup-friendly lenders and build business credit." });
  }

  return risks;
}

function identifyRevenueRiskFactors(revenue: number, client: any): RiskFactor[] {
  const risks: RiskFactor[] = [];

  if (revenue < 100000) {
    risks.push({ severity: "medium", factor: "Annual revenue under $100K limits options", recommendation: "Focus on growing revenue while using available MCA and revenue-based products." });
  }

  if (!client.entityType || client.entityType === "sole_proprietorship") {
    risks.push({ severity: "low", factor: "Sole proprietorship structure", recommendation: "Consider forming an LLC to separate business and personal liability. Many lenders prefer LLC/Corp." });
  }

  if (!client.ein) {
    risks.push({ severity: "medium", factor: "No EIN on file", recommendation: "Get an EIN from IRS (free, instant online). Required for most business funding." });
  }

  return risks;
}

function generateImprovements(avgScore: number, cp: CreditProfile, client: any): Improvement[] {
  const improvements: Improvement[] = [];

  if (avgScore < 740) {
    improvements.push({
      priority: "high",
      action: "Reduce credit utilization below 10%",
      impact: "Could increase score 20-50 points",
      timeframe: "1-2 billing cycles",
    });
  }

  const maxDerogatories = Math.max(
    cp.experian?.derogatoryAccounts || 0,
    cp.equifax?.derogatoryAccounts || 0,
    cp.transUnion?.derogatoryAccounts || 0
  );

  if (maxDerogatories > 0) {
    improvements.push({
      priority: "high",
      action: "Dispute derogatory accounts and negotiate pay-for-delete agreements",
      impact: "Removing derogatory items can increase score 50-100+ points",
      timeframe: "30-90 days per dispute",
    });
  }

  if (!client.businessAge || !client.businessAge.match(/[2-9]|[1-9]\d/)) {
    improvements.push({
      priority: "medium",
      action: "Build business credit tradelines (Net 30 vendors)",
      impact: "Establishes business credit profile separate from personal",
      timeframe: "3-6 months",
    });
  }

  improvements.push({
    priority: "medium",
    action: "Add authorized user tradelines with long history",
    impact: "Inherit credit age and positive history",
    timeframe: "1-2 billing cycles to report",
  });

  return improvements;
}

function generateRevenueImprovements(revenue: number, client: any): Improvement[] {
  const improvements: Improvement[] = [];

  if (revenue < 250000) {
    improvements.push({
      priority: "high",
      action: "Increase monthly revenue through client acquisition or pricing optimization",
      impact: "Higher revenue unlocks better funding terms and larger amounts",
      timeframe: "Ongoing",
    });
  }

  improvements.push({
    priority: "medium",
    action: "Maintain clean bank statements — avoid NSFs, negative balances, and gambling transactions",
    impact: "Lenders review 3-6 months of statements. Clean history improves approval odds significantly.",
    timeframe: "Immediate",
  });

  if (!client.entityType || client.entityType === "sole_proprietorship") {
    improvements.push({
      priority: "medium",
      action: "Upgrade to LLC or Corporation",
      impact: "Opens access to more lenders and separates personal liability",
      timeframe: "1-2 weeks",
    });
  }

  return improvements;
}

function generateCreditSummary(avgScore: number, phases: FundingPhase[], risks: RiskFactor[]): string {
  const tier = getScoreTier(avgScore);
  const total = phases.reduce((s, p) => s + p.totalProjected, 0);
  const highRisks = risks.filter((r) => r.severity === "high").length;

  let summary = `Credit score: ${avgScore} (${tier}). `;
  summary += `${phases.length}-phase funding blueprint projecting $${total.toLocaleString()} in total funding. `;

  if (tier === "excellent") {
    summary += "Strong credit profile enables aggressive stacking strategy across multiple product types.";
  } else if (tier === "good") {
    summary += "Solid credit foundation supports a multi-phase approach starting with credit cards and scaling to term products.";
  } else if (tier === "fair") {
    summary += "Credit building phase recommended before pursuing larger funding products. Focus on quick wins first.";
  } else {
    summary += "Credit repair recommended as first priority. Revenue-based funding may be available while building credit.";
  }

  if (highRisks > 0) {
    summary += ` ${highRisks} high-priority risk factor(s) identified — see details below.`;
  }

  return summary;
}

function generateRevenueSummary(revenue: number, phases: FundingPhase[], totalProjected: number): string {
  const monthly = revenue / 12;
  let summary = `Annual revenue: $${revenue.toLocaleString()} ($${Math.round(monthly).toLocaleString()}/mo). `;
  summary += `${phases.length}-phase revenue-based blueprint projecting $${totalProjected.toLocaleString()} in total funding. `;
  summary += "Revenue-based lenders prioritize cash flow over credit score, enabling faster access to capital.";
  return summary;
}

// ─── Credit Repair Referral Actions ───

export async function createCreditRepairReferral(
  clientId: string,
  data: {
    bookingDate?: string;
    bookingTime?: string;
    salesRepName?: string;
    notes?: string;
  }
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
  });
  if (!client) throw new Error("Client not found");

  const referral = await prisma.creditRepairReferral.create({
    data: {
      subAccountId,
      clientId,
      clientName: `${client.firstName} ${client.lastName}`.trim(),
      clientEmail: client.email,
      clientPhone: client.phone,
      status: data.bookingDate ? "booked" : "pending",
      bookingDate: data.bookingDate || null,
      bookingTime: data.bookingTime || null,
      salesRepName: data.salesRepName || "",
      notes: data.notes || "",
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return referral;
}

export async function getCreditRepairReferrals(clientId?: string) {
  const subAccountId = await getSubAccountId();
  return prisma.creditRepairReferral.findMany({
    where: {
      subAccountId,
      ...(clientId ? { clientId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function updateCreditRepairReferral(
  id: string,
  data: {
    status?: string;
    bookingDate?: string;
    bookingTime?: string;
    salesRepName?: string;
    commissionStatus?: string;
    commissionPaidAt?: string;
    notes?: string;
  }
) {
  const subAccountId = await getSubAccountId();
  const referral = await prisma.creditRepairReferral.findFirst({
    where: { id, subAccountId },
  });
  if (!referral) throw new Error("Referral not found");

  const updated = await prisma.creditRepairReferral.update({
    where: { id },
    data,
  });

  revalidatePath(`/admin/clients/${referral.clientId}`);
  return updated;
}

export async function getReferralCommissionSummary() {
  const subAccountId = await getSubAccountId();
  const referrals = await prisma.creditRepairReferral.findMany({
    where: { subAccountId },
  });

  const total = referrals.length;
  const enrolled = referrals.filter((r) => r.status === "enrolled" || r.status === "paid").length;
  const totalEarned = referrals
    .filter((r) => r.status === "enrolled" || r.status === "paid")
    .reduce((sum, r) => sum + r.commissionAmount, 0);
  const totalPaid = referrals
    .filter((r) => r.commissionStatus === "paid")
    .reduce((sum, r) => sum + r.commissionAmount, 0);
  const pending = totalEarned - totalPaid;

  return { total, enrolled, totalEarned, totalPaid, pending };
}
