"use server";

/**
 * Revenue-Based Lending Engine
 *
 * For clients who don't qualify for credit card stacking (below 680 score)
 * or who have strong revenue but weaker credit.
 *
 * Matches clients to lending products based on:
 * - Monthly/annual revenue
 * - Time in business
 * - Documentation available (bank statements, tax returns, P&L)
 * - Credit score (even low scores qualify for some products)
 * - Industry type
 * - Funding purpose
 *
 * Also cross-sells credit repair for clients below 680.
 */

// ─── Lending Product Knowledge Base ───

export interface LendingProduct {
  id: string;
  name: string;
  type: "mca" | "term_loan" | "line_of_credit" | "equipment_financing" | "sba_7a" | "sba_504" | "sba_microloan" | "revenue_based" | "invoice_factoring" | "vc_capital";
  category: "revenue_based" | "asset_based" | "government" | "equity";

  // Qualification criteria
  minCreditScore: number | null; // null = no minimum
  minMonthlyRevenue: number;
  minTimeInBusinessMonths: number;
  minAnnualRevenue: number;

  // Documentation required
  requiresBankStatements: boolean;
  bankStatementMonths: number; // How many months needed
  requiresTaxReturns: boolean;
  requiresPnL: boolean;
  requiresCollateral: boolean;
  collateralNotes: string;
  documentationType: "minimal" | "standard" | "full";

  // Funding details
  typicalAmountMin: number;
  typicalAmountMax: number;
  amountCalculation: string; // How amount is determined
  typicalTermMin: number; // Months
  typicalTermMax: number;
  typicalRateMin: number; // APR or factor rate
  typicalRateMax: number;
  rateType: "apr" | "factor_rate" | "percentage_of_revenue";
  fundingSpeed: string; // "1-3 days", "2-4 weeks", etc.

  // Fit scoring
  bestFor: string;
  notIdealFor: string;
  pros: string[];
  cons: string[];
}

const LENDING_PRODUCTS: LendingProduct[] = [
  // ─── MERCHANT CASH ADVANCE ───
  {
    id: "mca_standard",
    name: "Merchant Cash Advance (MCA)",
    type: "mca",
    category: "revenue_based",
    minCreditScore: 500,
    minMonthlyRevenue: 10000,
    minTimeInBusinessMonths: 3,
    minAnnualRevenue: 120000,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "",
    documentationType: "minimal",
    typicalAmountMin: 5000,
    typicalAmountMax: 500000,
    amountCalculation: "Typically 1-1.5x monthly revenue. Based on average daily bank deposits.",
    typicalTermMin: 3,
    typicalTermMax: 18,
    typicalRateMin: 1.1,
    typicalRateMax: 1.5,
    rateType: "factor_rate",
    fundingSpeed: "1-3 business days",
    bestFor: "Businesses needing fast capital with strong daily deposits. Any credit score.",
    notIdealFor: "Businesses with inconsistent revenue or seasonal cash flow dips.",
    pros: [
      "Fastest funding option (1-3 days)",
      "Credit score as low as 500 accepted",
      "No collateral required",
      "Only 3 months in business needed",
      "Approval based on revenue, not credit",
    ],
    cons: [
      "Highest cost of capital (factor rates 1.1-1.5x)",
      "Daily or weekly automatic repayments",
      "Can create cash flow strain",
      "Not reported to credit bureaus (doesn't build credit)",
    ],
  },

  // ─── REVENUE-BASED LINE OF CREDIT ───
  {
    id: "rev_loc",
    name: "Revenue-Based Line of Credit",
    type: "line_of_credit",
    category: "revenue_based",
    minCreditScore: 550,
    minMonthlyRevenue: 8000,
    minTimeInBusinessMonths: 6,
    minAnnualRevenue: 96000,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "",
    documentationType: "minimal",
    typicalAmountMin: 10000,
    typicalAmountMax: 250000,
    amountCalculation: "Up to 3x average monthly revenue. Revolving — draw, repay, draw again.",
    typicalTermMin: 6,
    typicalTermMax: 24,
    typicalRateMin: 15,
    typicalRateMax: 80,
    rateType: "apr",
    fundingSpeed: "1-5 business days",
    bestFor: "Businesses needing flexible access to capital. Draw only what you need.",
    notIdealFor: "One-time large purchases (term loan is better). Very new businesses under 6 months.",
    pros: [
      "Revolving credit — only pay interest on what you use",
      "Fast access after initial approval",
      "Lower barrier than traditional bank LOC",
      "Flexible repayment",
    ],
    cons: [
      "Higher rates than bank lines of credit",
      "May have draw fees",
      "Requires consistent monthly revenue",
    ],
  },

  // ─── SHORT-TERM BUSINESS LOAN ───
  {
    id: "short_term_loan",
    name: "Short-Term Business Loan",
    type: "term_loan",
    category: "revenue_based",
    minCreditScore: 550,
    minMonthlyRevenue: 10000,
    minTimeInBusinessMonths: 6,
    minAnnualRevenue: 120000,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "",
    documentationType: "minimal",
    typicalAmountMin: 10000,
    typicalAmountMax: 500000,
    amountCalculation: "Based on monthly revenue and time in business. Typically up to 30% of annual revenue.",
    typicalTermMin: 3,
    typicalTermMax: 18,
    typicalRateMin: 15,
    typicalRateMax: 80,
    rateType: "apr",
    fundingSpeed: "1-5 business days",
    bestFor: "Short-term capital needs. Businesses with 6+ months history and consistent revenue.",
    notIdealFor: "Long-term investments. Businesses needing the lowest possible rate.",
    pros: [
      "Fixed repayment schedule",
      "Lower cost than MCA",
      "No collateral required",
      "Fast funding",
    ],
    cons: [
      "Higher rates than traditional bank loans",
      "Short terms mean higher periodic payments",
      "Daily or weekly repayments common",
    ],
  },

  // ─── MEDIUM-TERM BUSINESS LOAN ───
  {
    id: "medium_term_loan",
    name: "Medium-Term Business Loan",
    type: "term_loan",
    category: "revenue_based",
    minCreditScore: 600,
    minMonthlyRevenue: 15000,
    minTimeInBusinessMonths: 12,
    minAnnualRevenue: 180000,
    requiresBankStatements: true,
    bankStatementMonths: 6,
    requiresTaxReturns: true,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "May require personal guarantee",
    documentationType: "standard",
    typicalAmountMin: 25000,
    typicalAmountMax: 500000,
    amountCalculation: "Up to 30% of annual revenue. Based on cash flow, credit, and time in business.",
    typicalTermMin: 12,
    typicalTermMax: 60,
    typicalRateMin: 8,
    typicalRateMax: 30,
    rateType: "apr",
    fundingSpeed: "3-10 business days",
    bestFor: "Established businesses needing growth capital at better rates than MCA/short-term.",
    notIdealFor: "Businesses under 1 year. Those who can't provide tax returns.",
    pros: [
      "Better rates than short-term/MCA",
      "Longer repayment terms (1-5 years)",
      "Monthly payments (easier cash flow management)",
      "Can build business credit",
    ],
    cons: [
      "Requires tax returns",
      "Slower funding than MCA",
      "May require personal guarantee",
      "Higher credit score needed (600+)",
    ],
  },

  // ─── EQUIPMENT FINANCING ───
  {
    id: "equipment_financing",
    name: "Equipment Financing",
    type: "equipment_financing",
    category: "asset_based",
    minCreditScore: 500,
    minMonthlyRevenue: 0,
    minTimeInBusinessMonths: 6,
    minAnnualRevenue: 50000,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: true,
    collateralNotes: "The equipment itself serves as collateral. Equipment quote or invoice required.",
    documentationType: "minimal",
    typicalAmountMin: 5000,
    typicalAmountMax: 5000000,
    amountCalculation: "Up to 100% of equipment value. Amount based on equipment cost, not revenue.",
    typicalTermMin: 12,
    typicalTermMax: 84,
    typicalRateMin: 5,
    typicalRateMax: 30,
    rateType: "apr",
    fundingSpeed: "3-7 business days",
    bestFor: "Businesses purchasing equipment, vehicles, or machinery. Bad credit OK — equipment is collateral.",
    notIdealFor: "Working capital needs. Software or non-tangible purchases.",
    pros: [
      "Credit scores as low as 500 accepted",
      "Equipment serves as collateral (easier approval)",
      "Long terms up to 7 years",
      "Tax benefits (Section 179 deduction)",
      "Fixed monthly payments",
    ],
    cons: [
      "Can only be used for equipment purchases",
      "May require down payment (10-20%)",
      "Equipment can be repossessed if you default",
    ],
  },

  // ─── INVOICE FACTORING ───
  {
    id: "invoice_factoring",
    name: "Invoice Factoring",
    type: "invoice_factoring",
    category: "revenue_based",
    minCreditScore: null,
    minMonthlyRevenue: 5000,
    minTimeInBusinessMonths: 3,
    minAnnualRevenue: 60000,
    requiresBankStatements: false,
    bankStatementMonths: 0,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "Outstanding invoices serve as the asset",
    documentationType: "minimal",
    typicalAmountMin: 1000,
    typicalAmountMax: 5000000,
    amountCalculation: "70-90% of outstanding invoice value, advanced immediately. Remainder minus fees paid when client pays.",
    typicalTermMin: 1,
    typicalTermMax: 3,
    typicalRateMin: 1,
    typicalRateMax: 5,
    rateType: "percentage_of_revenue",
    fundingSpeed: "1-3 business days",
    bestFor: "B2B businesses with outstanding invoices. Credit score doesn't matter — based on client creditworthiness.",
    notIdealFor: "B2C businesses. Companies without receivables.",
    pros: [
      "No credit score requirement — based on YOUR clients' credit",
      "Very fast funding (1-3 days)",
      "Grows with your revenue",
      "No debt on balance sheet",
    ],
    cons: [
      "Only works for B2B with invoices",
      "Fees can add up (1-5% per invoice)",
      "Your clients may be contacted by the factoring company",
      "You don't get full invoice value upfront",
    ],
  },

  // ─── SBA 7(a) LOAN ───
  {
    id: "sba_7a",
    name: "SBA 7(a) Loan",
    type: "sba_7a",
    category: "government",
    minCreditScore: 640,
    minMonthlyRevenue: 8000,
    minTimeInBusinessMonths: 24,
    minAnnualRevenue: 100000,
    requiresBankStatements: true,
    bankStatementMonths: 12,
    requiresTaxReturns: true,
    requiresPnL: true,
    requiresCollateral: false,
    collateralNotes: "Collateral required for loans over $500K. Personal guarantee required.",
    documentationType: "full",
    typicalAmountMin: 25000,
    typicalAmountMax: 5000000,
    amountCalculation: "Based on business cash flow, ability to repay, and purpose. Up to $5M.",
    typicalTermMin: 60,
    typicalTermMax: 300,
    typicalRateMin: 5.5,
    typicalRateMax: 8,
    rateType: "apr",
    fundingSpeed: "30-90 days",
    bestFor: "Established businesses (2+ years) with strong financials wanting the best rates and longest terms.",
    notIdealFor: "Businesses needing fast funding. New businesses under 2 years. Score below 640.",
    pros: [
      "Lowest rates available (5.5-8% APR)",
      "Longest terms (up to 25 years for real estate)",
      "Up to $5 million",
      "Government-backed (easier approval vs conventional)",
    ],
    cons: [
      "Slowest process (30-90 days)",
      "Extensive documentation required",
      "640+ credit score needed (680+ preferred)",
      "2+ years in business typically required",
      "Personal guarantee required",
    ],
  },

  // ─── SBA 504 LOAN ───
  {
    id: "sba_504",
    name: "SBA 504 Loan (Real Estate & Equipment)",
    type: "sba_504",
    category: "government",
    minCreditScore: 615,
    minMonthlyRevenue: 10000,
    minTimeInBusinessMonths: 24,
    minAnnualRevenue: 120000,
    requiresBankStatements: true,
    bankStatementMonths: 12,
    requiresTaxReturns: true,
    requiresPnL: true,
    requiresCollateral: true,
    collateralNotes: "The real estate or equipment purchased serves as collateral. 10-20% down payment required.",
    documentationType: "full",
    typicalAmountMin: 125000,
    typicalAmountMax: 5500000,
    amountCalculation: "Based on project cost. SBA portion up to 40%, lender portion 50%, borrower 10% down.",
    typicalTermMin: 120,
    typicalTermMax: 300,
    typicalRateMin: 4.5,
    typicalRateMax: 7,
    rateType: "apr",
    fundingSpeed: "60-120 days",
    bestFor: "Purchasing commercial real estate or heavy equipment. Best long-term rates.",
    notIdealFor: "Working capital. Fast funding needs. Businesses under 2 years.",
    pros: [
      "Lowest fixed rates available",
      "Up to 25-year terms",
      "Only 10% down payment",
      "Up to $5.5 million",
    ],
    cons: [
      "Only for real estate or major equipment",
      "Slowest process (60-120 days)",
      "Full documentation required",
      "Must occupy 51%+ of commercial property",
    ],
  },

  // ─── SBA MICROLOAN ───
  {
    id: "sba_microloan",
    name: "SBA Microloan",
    type: "sba_microloan",
    category: "government",
    minCreditScore: 575,
    minMonthlyRevenue: 0,
    minTimeInBusinessMonths: 0,
    minAnnualRevenue: 0,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "May require collateral depending on intermediary lender",
    documentationType: "standard",
    typicalAmountMin: 500,
    typicalAmountMax: 50000,
    amountCalculation: "Up to $50,000. Average microloan is about $13,000.",
    typicalTermMin: 12,
    typicalTermMax: 72,
    typicalRateMin: 6,
    typicalRateMax: 13,
    rateType: "apr",
    fundingSpeed: "2-6 weeks",
    bestFor: "Startups, new businesses, underserved communities. Lower credit OK.",
    notIdealFor: "Businesses needing more than $50K. Those needing fast funding.",
    pros: [
      "Available to startups and new businesses",
      "Lower credit requirements (575+)",
      "Reasonable rates (6-13%)",
      "Often includes business mentoring/training",
    ],
    cons: [
      "Maximum $50,000",
      "Slow process (2-6 weeks)",
      "Must apply through intermediary lenders",
      "May require business plan",
    ],
  },

  // ─── REVENUE-BASED FINANCING ───
  {
    id: "revenue_based_financing",
    name: "Revenue-Based Financing",
    type: "revenue_based",
    category: "revenue_based",
    minCreditScore: null,
    minMonthlyRevenue: 10000,
    minTimeInBusinessMonths: 6,
    minAnnualRevenue: 120000,
    requiresBankStatements: true,
    bankStatementMonths: 3,
    requiresTaxReturns: false,
    requiresPnL: false,
    requiresCollateral: false,
    collateralNotes: "",
    documentationType: "minimal",
    typicalAmountMin: 25000,
    typicalAmountMax: 3000000,
    amountCalculation: "2-3x monthly revenue. Repayment is a fixed percentage of monthly revenue (flexible payments).",
    typicalTermMin: 6,
    typicalTermMax: 60,
    typicalRateMin: 10,
    typicalRateMax: 30,
    rateType: "percentage_of_revenue",
    fundingSpeed: "3-10 business days",
    bestFor: "Growing businesses with strong revenue. Payments flex with income — slower months = lower payments.",
    notIdealFor: "Businesses with declining revenue. Pre-revenue startups.",
    pros: [
      "No credit score requirement",
      "Payments flex with revenue (lower in slow months)",
      "No equity dilution",
      "No personal guarantee typically needed",
      "Fast funding",
    ],
    cons: [
      "Total cost can be high if revenue grows fast",
      "Requires consistent monthly revenue",
      "Not suitable for pre-revenue businesses",
    ],
  },
];

// ─── Matching Engine ───

export interface BusinessProfile {
  creditScore: number | null;
  monthlyRevenue: number;
  annualRevenue: number;
  timeInBusinessMonths: number;
  hasCollateral: boolean;
  hasBankStatements: boolean;
  bankStatementMonths: number;
  hasTaxReturns: boolean;
  hasPnL: boolean;
  hasInvoices: boolean;
  fundingPurpose: string;
  fundingAmountNeeded: number;
  industry: string;
}

export interface LendingMatch {
  product: LendingProduct;
  matchScore: number; // 0-100
  qualifies: boolean;
  estimatedAmount: { min: number; max: number };
  missingRequirements: string[];
  matchReasons: string[];
}

export async function matchLendingProducts(profile: BusinessProfile): Promise<{
  matches: LendingMatch[];
  crossSellCreditRepair: boolean;
  creditRepairMessage: string;
}> {
  const matches: LendingMatch[] = [];

  for (const product of LENDING_PRODUCTS) {
    const result = scoreMatch(product, profile);
    matches.push(result);
  }

  // Sort by match score descending, qualified first
  matches.sort((a, b) => {
    if (a.qualifies && !b.qualifies) return -1;
    if (!a.qualifies && b.qualifies) return 1;
    return b.matchScore - a.matchScore;
  });

  // Cross-sell credit repair if score is below 680
  const crossSellCreditRepair = !profile.creditScore || profile.creditScore < 680;
  const creditRepairMessage = crossSellCreditRepair
    ? profile.creditScore
      ? `Client's credit score of ${profile.creditScore} limits funding options and increases costs. Enrolling in credit repair can improve their score, unlocking better rates and credit card stacking (requires 680+). A higher score could save the client thousands in interest and fees.`
      : "No credit score on file. Credit repair and credit building can unlock significantly better funding options including 0% APR business credit cards."
    : "";

  return { matches, crossSellCreditRepair, creditRepairMessage };
}

function scoreMatch(product: LendingProduct, profile: BusinessProfile): LendingMatch {
  let score = 0;
  const missing: string[] = [];
  const reasons: string[] = [];
  let qualifies = true;

  // Credit score check
  if (product.minCreditScore) {
    if (!profile.creditScore || profile.creditScore < product.minCreditScore) {
      qualifies = false;
      missing.push(`Minimum credit score ${product.minCreditScore} required (client has ${profile.creditScore || "N/A"})`);
    } else {
      score += 15;
      reasons.push("Credit score meets requirement");
    }
  } else {
    score += 20; // No credit requirement = accessible
    reasons.push("No minimum credit score required");
  }

  // Revenue check
  if (profile.monthlyRevenue >= product.minMonthlyRevenue) {
    score += 20;
    reasons.push(`Monthly revenue $${profile.monthlyRevenue.toLocaleString()} meets minimum $${product.minMonthlyRevenue.toLocaleString()}`);

    // Bonus for exceeding minimum
    if (profile.monthlyRevenue >= product.minMonthlyRevenue * 2) score += 10;
  } else if (product.minMonthlyRevenue > 0) {
    qualifies = false;
    missing.push(`Minimum monthly revenue $${product.minMonthlyRevenue.toLocaleString()} required (client has $${profile.monthlyRevenue.toLocaleString()})`);
  }

  // Time in business check
  if (profile.timeInBusinessMonths >= product.minTimeInBusinessMonths) {
    score += 15;
    reasons.push("Time in business meets requirement");
  } else if (product.minTimeInBusinessMonths > 0) {
    qualifies = false;
    missing.push(`${product.minTimeInBusinessMonths} months in business required (client has ${profile.timeInBusinessMonths})`);
  }

  // Documentation check
  if (product.requiresBankStatements && !profile.hasBankStatements) {
    missing.push(`${product.bankStatementMonths} months of bank statements required`);
    score -= 5;
  } else if (product.requiresBankStatements && profile.hasBankStatements) {
    score += 10;
    reasons.push("Bank statements available");
  }

  if (product.requiresTaxReturns && !profile.hasTaxReturns) {
    missing.push("Tax returns required");
    score -= 5;
  } else if (product.requiresTaxReturns && profile.hasTaxReturns) {
    score += 10;
    reasons.push("Tax returns available");
  }

  if (product.requiresPnL && !profile.hasPnL) {
    missing.push("Profit & Loss statement required");
    score -= 5;
  }

  if (product.requiresCollateral && !profile.hasCollateral) {
    if (product.type === "equipment_financing") {
      // Equipment itself is collateral
      reasons.push("Equipment serves as collateral");
      score += 5;
    } else {
      missing.push("Collateral required");
      score -= 10;
    }
  }

  // Invoice factoring special case
  if (product.type === "invoice_factoring" && !profile.hasInvoices) {
    qualifies = false;
    missing.push("Outstanding B2B invoices required for factoring");
  }

  // Funding amount fit
  if (profile.fundingAmountNeeded > 0) {
    if (profile.fundingAmountNeeded >= product.typicalAmountMin &&
        profile.fundingAmountNeeded <= product.typicalAmountMax) {
      score += 15;
      reasons.push("Funding amount within product range");
    } else if (profile.fundingAmountNeeded > product.typicalAmountMax) {
      score -= 10;
      reasons.push("Requested amount exceeds typical maximum");
    }
  }

  // Speed bonus for urgent needs
  if (product.fundingSpeed.includes("1-3")) score += 5;

  // Calculate estimated amount
  let estMin = product.typicalAmountMin;
  let estMax = Math.min(product.typicalAmountMax, profile.annualRevenue * 0.5);
  if (product.type === "mca") {
    estMin = Math.min(profile.monthlyRevenue * 1, product.typicalAmountMax);
    estMax = Math.min(profile.monthlyRevenue * 1.5, product.typicalAmountMax);
  } else if (product.type === "line_of_credit" || product.type === "revenue_based") {
    estMin = Math.min(profile.monthlyRevenue * 1, product.typicalAmountMax);
    estMax = Math.min(profile.monthlyRevenue * 3, product.typicalAmountMax);
  }

  return {
    product,
    matchScore: Math.max(0, Math.min(100, score)),
    qualifies,
    estimatedAmount: { min: Math.round(estMin), max: Math.round(estMax) },
    missingRequirements: missing,
    matchReasons: reasons,
  };
}

// Export the product list for reference
export async function getAllLendingProducts(): Promise<LendingProduct[]> {
  return LENDING_PRODUCTS;
}
