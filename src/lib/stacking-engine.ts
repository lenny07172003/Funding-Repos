"use server";

import { prisma } from "./db";

/**
 * Credit Card Stacking Engine
 *
 * Qualification Requirements:
 * - 730+ across bureaus: Full stacking, limits above $10K on personal cards
 * - 680-729: Reduced stacking, lower limits
 * - Below 680: Does NOT qualify for credit card stacking
 * - Max 3 inquiries per bureau
 * - At least 2 years average credit history
 *
 * Input: Parsed credit report data (from SmartCredit, Array, or PDF upload)
 * Output: Personalized stacking blueprint with card-by-card instructions
 *
 * Sequencing logic:
 * 1. Cards where client has EXISTING bank relationship → priority (higher approval odds)
 * 2. Soft pull cards → apply first (no inquiry impact)
 * 3. Group sequenceable cards together (same color group)
 * 4. "Apply alone" cards get their own phase with proper spacing
 */

// ─── Input Types ───

export interface CreditReportData {
  scores: {
    experian: number | null;
    equifax: number | null;
    transUnion: number | null;
  };
  inquiries: {
    experian: number;
    equifax: number;
    transUnion: number;
  };
  creditAgeYears: number; // Average age of credit in years
  existingBanks: string[]; // Banks/creditors found on the credit report
  personalCardLimits: number[]; // Current personal card limits
  derogatoryAccounts: number;
  totalAccounts: number;
}

// ─── Output Types ───

export interface StackingStep {
  order: number;
  timing: string;
  cardName: string;
  bankName: string;
  bureau: string;
  pullType: string;
  isPriorityMatch: boolean;

  sweetNumbers: {
    bizRevenue: string;
    personalIncome: string;
    monthlySpend?: string;
    savings?: string;
    investments?: string;
  };

  projectedLimitMin: number | null;
  projectedLimitMax: number | null;
  hasZeroApr: boolean;
  zeroAprMonths: number;

  requiresRelationship: boolean;
  relationshipNotes: string;
  requiresInBranch: boolean;
  requiresBankStatements: boolean;
  documentationType: string;

  hacks: string;
  notes: string;
  applicationUrl: string;
  alsoOffers: string;
  maxExposure: number | null;
  inquiryWarning: string; // Empty if fine, warning message if inquiries should be removed first
}

export interface StackingPhase {
  phase: number;
  name: string;
  timing: string;
  steps: StackingStep[];
  phaseProjectedMin: number;
  phaseProjectedMax: number;
  rationale: string;
}

export interface StackingBlueprint {
  qualified: boolean;
  disqualifyReasons: string[];
  tier: "full" | "reduced" | "not_qualified";
  phases: StackingPhase[];
  totalProjectedMin: number;
  totalProjectedMax: number;
  totalCards: number;
  summary: string;
  priorityMatches: number;
  qualificationDetails: {
    averageScore: number;
    lowestScore: number;
    highestScore: number;
    maxInquiries: number;
    creditAgeYears: number;
    existingBankMatches: string[];
  };
}

// ─── Qualification Check ───

function checkQualification(data: CreditReportData): {
  qualified: boolean;
  tier: "full" | "reduced" | "not_qualified";
  reasons: string[];
} {
  const reasons: string[] = [];
  const validScores = [data.scores.experian, data.scores.equifax, data.scores.transUnion]
    .filter((s): s is number => s != null && s > 0);

  if (validScores.length === 0) {
    return { qualified: false, tier: "not_qualified", reasons: ["No credit scores available."] };
  }

  const lowestScore = Math.min(...validScores);
  const avgScore = Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length);
  const maxInquiries = Math.max(data.inquiries.experian, data.inquiries.equifax, data.inquiries.transUnion);

  // Check disqualifiers — only score below 680 is a hard disqualifier
  if (lowestScore < 680) {
    reasons.push(`Lowest credit score is ${lowestScore} — minimum 680 required for credit card stacking.`);
    return { qualified: false, tier: "not_qualified", reasons };
  }

  // Recommendations (not disqualifiers)
  if (maxInquiries > 3) {
    reasons.push(`RECOMMENDATION: ${maxInquiries} inquiries detected on one bureau — inquiries should be removed before applying for best results.`);
  }

  if (data.creditAgeYears > 0 && data.creditAgeYears < 2) {
    reasons.push(`RECOMMENDATION: Credit history is ${data.creditAgeYears < 1 ? "under 1 year" : `${data.creditAgeYears.toFixed(1)} years`} — 2+ years is ideal for higher approvals.`);
  }

  // Full qualification
  if (avgScore >= 730) {
    return { qualified: true, tier: "full", reasons: [] };
  }

  // 680-729 = reduced
  return {
    qualified: true,
    tier: "reduced",
    reasons: [`Average score ${avgScore} is below 730 — stacking with reduced limits.`],
  };
}

// ─── Main Engine ───

export async function generateStackingBlueprint(data: CreditReportData): Promise<StackingBlueprint> {
  const qualification = checkQualification(data);

  const validScores = [data.scores.experian, data.scores.equifax, data.scores.transUnion]
    .filter((s): s is number => s != null && s > 0);
  const avgScore = validScores.length > 0
    ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
    : 0;

  // If not qualified for credit card stacking, route to revenue-based lending + credit repair
  if (!qualification.qualified) {
    return {
      qualified: false,
      disqualifyReasons: qualification.reasons,
      tier: "not_qualified",
      phases: [],
      totalProjectedMin: 0,
      totalProjectedMax: 0,
      totalCards: 0,
      summary: `Client does not qualify for credit card stacking (score below 680). Route to revenue-based funding analysis — if the business has revenue, they can still access MCAs, term loans, lines of credit, equipment financing, and SBA products. Cross-sell credit repair to build score toward 680+ for future stacking eligibility.`,
      priorityMatches: 0,
      qualificationDetails: {
        averageScore: avgScore,
        lowestScore: validScores.length > 0 ? Math.min(...validScores) : 0,
        highestScore: validScores.length > 0 ? Math.max(...validScores) : 0,
        maxInquiries: Math.max(data.inquiries.experian, data.inquiries.equifax, data.inquiries.transUnion),
        creditAgeYears: data.creditAgeYears,
        existingBankMatches: [],
      },
    };
  }

  // Fetch all active cards
  const allCards = await prisma.stackingCard.findMany({
    where: { isActive: true },
    orderBy: [{ bureau: "asc" }, { stackingOrder: "asc" }],
  });

  // Filter cards by bureau score — only exclude if score is below 680 for that bureau
  const qualifiedCards = allCards.filter((card) => {
    const bureauScore = data.scores[card.bureau as keyof typeof data.scores];
    if (!bureauScore || bureauScore < 680) return false;
    return true;
  });

  // Score each card
  const scoredCards = qualifiedCards.map((card) => {
    let priorityScore = 0;

    // Existing bank relationship = highest priority
    const hasRelationship = data.existingBanks.some(
      (bank) => bank.toLowerCase().includes(card.bankName.toLowerCase()) ||
                card.bankName.toLowerCase().includes(bank.toLowerCase())
    );
    if (hasRelationship) priorityScore += 100;

    // Soft pulls first
    if (card.pullType === "soft" || card.pullType === "soft_initial") priorityScore += 50;

    // 0% APR cards are more valuable
    if (card.hasZeroApr) priorityScore += 20;

    // Higher typical limits = more valuable
    if (card.typicalLimitMax) priorityScore += Math.min(card.typicalLimitMax / 5000, 20);

    // Non-doc / stated income cards are easier
    if (card.documentationType === "non_doc" || card.documentationType === "stated") priorityScore += 10;

    // No relationship required = easier
    if (!card.requiresRelationship) priorityScore += 5;

    // Flag if this bureau has too many inquiries
    const bureauInquiries = data.inquiries[card.bureau as keyof typeof data.inquiries] || 0;
    const hasInquiryWarning = bureauInquiries > 3;

    // Adjust projected limits based on tier
    let limitMultiplier = 1;
    if (qualification.tier === "reduced") limitMultiplier = 0.6;

    return {
      card,
      hasInquiryWarning,
      bureauInquiries,
      priorityScore,
      hasRelationship,
      limitMultiplier,
    };
  });

  // Sort by priority
  scoredCards.sort((a, b) => b.priorityScore - a.priorityScore);

  // Build phases
  const phases: StackingPhase[] = [];
  const usedCardIds = new Set<string>();
  let currentDay = 1;
  let phaseNum = 1;

  // Phase 1: Priority matches (existing bank relationships) + soft pulls
  const phase1Cards = scoredCards.filter(
    (sc) => (sc.hasRelationship || sc.card.pullType === "soft" || sc.card.pullType === "soft_initial") && !usedCardIds.has(sc.card.id)
  );

  if (phase1Cards.length > 0) {
    const steps: StackingStep[] = [];
    for (const sc of phase1Cards) {
      usedCardIds.add(sc.card.id);
      steps.push(buildStep(sc.card, currentDay, sc.hasRelationship, steps.length + 1, sc.limitMultiplier, sc.hasInquiryWarning ? `${sc.bureauInquiries} inquiries on ${sc.card.bureau} — recommend removing inquiries before applying to this card.` : ""));

      // Pull in sequenceable cards from the same group
      if (sc.card.sequenceGroup) {
        const groupCards = scoredCards.filter(
          (gc) => gc.card.sequenceGroup === sc.card.sequenceGroup && !usedCardIds.has(gc.card.id)
        );
        for (const gc of groupCards) {
          usedCardIds.add(gc.card.id);
          steps.push(buildStep(gc.card, currentDay, gc.hasRelationship, steps.length + 1, gc.limitMultiplier, gc.hasInquiryWarning ? `${gc.bureauInquiries} inquiries on ${gc.card.bureau} — recommend removing inquiries before applying.` : ""));
        }
      }

      currentDay += sc.card.waitDaysAfter > 0 ? sc.card.waitDaysAfter : 1;
    }

    phases.push({
      phase: phaseNum++,
      name: "Priority — Existing Relationships & Soft Pulls",
      timing: `Day 1${currentDay > 2 ? `-${currentDay}` : ""}`,
      steps,
      phaseProjectedMin: steps.reduce((s, st) => s + (st.projectedLimitMin || 0), 0),
      phaseProjectedMax: steps.reduce((s, st) => s + (st.projectedLimitMax || 0), 0),
      rationale: "Banks where the client already has a relationship are applied to first — highest approval odds. Soft pull cards included since they don't add inquiries.",
    });
  }

  // Phase 2: Sequenceable card groups
  const phase2Cards = scoredCards.filter(
    (sc) => sc.card.sequenceGroup && !sc.card.applyAlone && !usedCardIds.has(sc.card.id)
  );
  const groups = new Map<string, typeof phase2Cards>();
  for (const sc of phase2Cards) {
    const group = groups.get(sc.card.sequenceGroup) || [];
    group.push(sc);
    groups.set(sc.card.sequenceGroup, group);
  }

  for (const [, groupCards] of Array.from(groups.entries())) {
    const steps: StackingStep[] = [];
    for (const sc of groupCards) {
      usedCardIds.add(sc.card.id);
      steps.push(buildStep(sc.card, currentDay, sc.hasRelationship, steps.length + 1, sc.limitMultiplier, sc.hasInquiryWarning ? `${sc.bureauInquiries} inquiries on ${sc.card.bureau} — recommend removing inquiries before applying to this card.` : ""));
    }
    if (steps.length > 0) {
      phases.push({
        phase: phaseNum++,
        name: `${groupCards[0].card.bankName} Sequence`,
        timing: `Day ${currentDay}`,
        steps,
        phaseProjectedMin: steps.reduce((s, st) => s + (st.projectedLimitMin || 0), 0),
        phaseProjectedMax: steps.reduce((s, st) => s + (st.projectedLimitMax || 0), 0),
        rationale: "These cards can be applied together as a sequence for maximum efficiency.",
      });
      currentDay += 2;
    }
  }

  // Phase 3: Remaining individual cards
  const remainingCards = scoredCards.filter((sc) => !usedCardIds.has(sc.card.id));
  if (remainingCards.length > 0) {
    const steps: StackingStep[] = [];
    for (const sc of remainingCards) {
      usedCardIds.add(sc.card.id);
      steps.push(buildStep(sc.card, currentDay, sc.hasRelationship, steps.length + 1, sc.limitMultiplier, sc.hasInquiryWarning ? `${sc.bureauInquiries} inquiries on ${sc.card.bureau} — recommend removing inquiries before applying to this card.` : ""));
      currentDay += sc.card.waitDaysAfter > 0 ? sc.card.waitDaysAfter : 2;
    }

    phases.push({
      phase: phaseNum++,
      name: "Individual Applications",
      timing: `Day ${currentDay - (remainingCards.length * 2)}+`,
      steps,
      phaseProjectedMin: steps.reduce((s, st) => s + (st.projectedLimitMin || 0), 0),
      phaseProjectedMax: steps.reduce((s, st) => s + (st.projectedLimitMax || 0), 0),
      rationale: "Apply individually with 2+ day spacing between applications.",
    });
  }

  // Calculate totals
  const totalProjectedMin = phases.reduce((s, p) => s + p.phaseProjectedMin, 0);
  const totalProjectedMax = phases.reduce((s, p) => s + p.phaseProjectedMax, 0);
  const totalCards = phases.reduce((s, p) => s + p.steps.length, 0);
  const priorityMatches = phases.reduce(
    (s, p) => s + p.steps.filter((st) => st.isPriorityMatch).length, 0
  );
  const existingBankMatches = data.existingBanks.filter((bank) =>
    qualifiedCards.some((c) =>
      c.bankName.toLowerCase().includes(bank.toLowerCase()) ||
      bank.toLowerCase().includes(c.bankName.toLowerCase())
    )
  );

  const tierLabel = qualification.tier === "full" ? "Full Stacking (730+)" : "Reduced Stacking (680-729)";
  let summary = `${tierLabel} — ${totalCards}-card blueprint across ${phases.length} phases. `;
  summary += `Projected funding: $${totalProjectedMin.toLocaleString()}-$${totalProjectedMax.toLocaleString()}. `;
  if (priorityMatches > 0) {
    summary += `${priorityMatches} card(s) prioritized from existing bank relationships. `;
  }
  if (qualification.reasons.length > 0) {
    summary += qualification.reasons.join(" ");
  }

  return {
    qualified: true,
    disqualifyReasons: [],
    tier: qualification.tier,
    phases,
    totalProjectedMin,
    totalProjectedMax,
    totalCards,
    summary,
    priorityMatches,
    qualificationDetails: {
      averageScore: avgScore,
      lowestScore: validScores.length > 0 ? Math.min(...validScores) : 0,
      highestScore: validScores.length > 0 ? Math.max(...validScores) : 0,
      maxInquiries: Math.max(data.inquiries.experian, data.inquiries.equifax, data.inquiries.transUnion),
      creditAgeYears: data.creditAgeYears,
      existingBankMatches,
    },
  };
}

// ─── Step Builder ───

function buildStep(card: any, day: number, isPriority: boolean, order: number, limitMultiplier: number, inquiryWarning: string = ""): StackingStep {
  const adjMin = card.typicalLimitMin ? Math.round(card.typicalLimitMin * limitMultiplier) : null;
  const adjMax = card.typicalLimitMax ? Math.round(card.typicalLimitMax * limitMultiplier) : null;

  return {
    order,
    timing: card.waitDaysAfter > 0 ? `Day ${day} (wait ${card.waitDaysAfter} days before next)` : `Day ${day}`,
    cardName: card.cardName,
    bankName: card.bankName,
    bureau: card.bureau,
    pullType: card.pullType,
    isPriorityMatch: isPriority,
    sweetNumbers: {
      bizRevenue: formatRange(card.sweetBizRevenueMin, card.sweetBizRevenueMax),
      personalIncome: formatRange(card.sweetPersonalIncomeMin, card.sweetPersonalIncomeMax),
      monthlySpend: card.sweetMonthlySpend ? `$${card.sweetMonthlySpend.toLocaleString()}` : undefined,
      savings: card.sweetSavings ? `$${card.sweetSavings.toLocaleString()}` : undefined,
      investments: card.sweetInvestments ? `$${card.sweetInvestments.toLocaleString()}` : undefined,
    },
    projectedLimitMin: adjMin,
    projectedLimitMax: adjMax,
    hasZeroApr: card.hasZeroApr,
    zeroAprMonths: card.zeroAprMonths,
    requiresRelationship: card.requiresRelationship,
    relationshipNotes: card.relationshipNotes,
    requiresInBranch: card.requiresInBranch,
    requiresBankStatements: card.requiresBankStatements,
    documentationType: card.documentationType,
    hacks: card.hacks,
    notes: card.notes,
    applicationUrl: card.applicationUrl,
    alsoOffers: card.alsoOffers,
    maxExposure: card.maxExposure,
    inquiryWarning,
  };
}

function formatRange(min: number | null, max: number | null): string {
  if (!min && !max) return "N/A";
  if (min && max) return `$${min.toLocaleString()}-$${max.toLocaleString()}`;
  if (min) return `$${min.toLocaleString()}+`;
  return `Up to $${max!.toLocaleString()}`;
}
