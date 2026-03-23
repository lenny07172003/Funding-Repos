"use server";

import type { CreditReportData } from "./stacking-engine";

/**
 * Credit Report Parser
 *
 * Extracts credit data from:
 * 1. SmartCredit report exports
 * 2. Array (formerly CreditWorks) exports
 * 3. Manual PDF upload — text is extracted and parsed for key data points
 *
 * Key data extracted:
 * - Scores per bureau (Experian, Equifax, TransUnion)
 * - Inquiry count per bureau
 * - Average credit age in years
 * - List of existing creditors/banks
 * - Personal card limits
 * - Derogatory account count
 */

// Common bank/creditor name patterns to look for in credit reports
const KNOWN_BANKS = [
  "chase", "jpmorgan", "american express", "amex", "bank of america", "boa",
  "wells fargo", "citibank", "citi", "capital one", "discover", "barclays",
  "us bank", "usbank", "pnc", "td bank", "truist", "keybank", "citizens",
  "navy federal", "usaa", "goldman sachs", "marcus", "synchrony",
  "fnbo", "first national", "elan", "valley national", "m&t bank",
  "bethpage", "teachers federal", "service credit union", "paypal",
  "bhg", "apple card",
];

/**
 * Parse manually entered credit report data.
 * Used when admin enters scores/data directly or uploads a report.
 */
export async function parseManualCreditData(input: {
  experianScore: number | null;
  equifaxScore: number | null;
  transUnionScore: number | null;
  experianInquiries: number;
  equifaxInquiries: number;
  transUnionInquiries: number;
  creditAgeYears: number;
  existingBanks: string[];
  personalCardLimits: number[];
  derogatoryAccounts: number;
  totalAccounts: number;
}): Promise<CreditReportData> {
  return {
    scores: {
      experian: input.experianScore,
      equifax: input.equifaxScore,
      transUnion: input.transUnionScore,
    },
    inquiries: {
      experian: input.experianInquiries,
      equifax: input.equifaxInquiries,
      transUnion: input.transUnionInquiries,
    },
    creditAgeYears: input.creditAgeYears,
    existingBanks: input.existingBanks,
    personalCardLimits: input.personalCardLimits,
    derogatoryAccounts: input.derogatoryAccounts,
    totalAccounts: input.totalAccounts,
  };
}

/**
 * Parse credit report text content (extracted from PDF or pasted).
 * Looks for patterns matching scores, inquiries, account names, etc.
 */
export async function parseCreditReportText(text: string): Promise<CreditReportData> {
  const normalizedText = text.toLowerCase();

  // Extract scores
  const scores = extractScores(text);

  // Extract inquiries
  const inquiries = extractInquiries(text);

  // Extract existing banks/creditors
  const existingBanks = extractBanks(normalizedText);

  // Extract credit age
  const creditAgeYears = extractCreditAge(text);

  // Extract card limits
  const personalCardLimits = extractCardLimits(text);

  // Extract derogatory count
  const derogatoryAccounts = extractDerogatoryCount(text);

  // Extract total accounts
  const totalAccounts = extractTotalAccounts(text);

  return {
    scores,
    inquiries,
    creditAgeYears,
    existingBanks,
    personalCardLimits,
    derogatoryAccounts,
    totalAccounts,
  };
}

// ─── Extraction Helpers ───

function extractScores(text: string): CreditReportData["scores"] {
  const scores: CreditReportData["scores"] = { experian: null, equifax: null, transUnion: null };

  // Pattern: "Experian: 742" or "Experian Score: 742" or "EX: 742"
  const patterns = [
    { bureau: "experian" as const, regex: /experian[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "equifax" as const, regex: /equifax[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    // Abbreviations
    { bureau: "experian" as const, regex: /\bEX[:\s]+(\d{3})\b/ },
    { bureau: "equifax" as const, regex: /\bEQ[:\s]+(\d{3})\b/ },
    { bureau: "transUnion" as const, regex: /\bTU[:\s]+(\d{3})\b/ },
  ];

  for (const { bureau, regex } of patterns) {
    const match = text.match(regex);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 300 && score <= 850) {
        scores[bureau] = score;
      }
    }
  }

  // Fallback: look for 3 consecutive scores (common in credit report exports)
  if (!scores.experian && !scores.equifax && !scores.transUnion) {
    const allScores = text.match(/\b(7\d{2}|6\d{2}|5\d{2}|8\d{2})\b/g);
    if (allScores && allScores.length >= 3) {
      const parsed = allScores.map(Number).filter((s) => s >= 300 && s <= 850);
      if (parsed.length >= 3) {
        // Assume order: Experian, Equifax, TransUnion (most common report order)
        scores.experian = parsed[0];
        scores.equifax = parsed[1];
        scores.transUnion = parsed[2];
      }
    }
  }

  return scores;
}

function extractInquiries(text: string): CreditReportData["inquiries"] {
  const inquiries = { experian: 0, equifax: 0, transUnion: 0 };

  // Pattern: "Inquiries: 2" near bureau name, or "Experian Inquiries: 2"
  const patterns = [
    { bureau: "experian" as const, regex: /experian[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "equifax" as const, regex: /equifax[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
  ];

  for (const { bureau, regex } of patterns) {
    const match = text.match(regex);
    if (match) {
      inquiries[bureau] = parseInt(match[1]) || 0;
    }
  }

  return inquiries;
}

function extractBanks(text: string): string[] {
  const found: string[] = [];
  for (const bank of KNOWN_BANKS) {
    if (text.includes(bank)) {
      // Capitalize properly
      const proper = bank.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!found.includes(proper)) {
        found.push(proper);
      }
    }
  }
  return found;
}

function extractCreditAge(text: string): number {
  // Pattern: "Average Age: 5 years 3 months" or "Credit Age: 7.5 years"
  const yearMatch = text.match(/(?:average|credit)\s*(?:age|history)[:\s]*(\d+)\s*(?:years?|yrs?)/i);
  if (yearMatch) {
    let years = parseInt(yearMatch[1]);
    const monthMatch = text.match(/(?:average|credit)\s*(?:age|history)[:\s]*\d+\s*(?:years?|yrs?)\s*(?:and\s*)?(\d+)\s*(?:months?|mos?)/i);
    if (monthMatch) {
      years += parseInt(monthMatch[1]) / 12;
    }
    return years;
  }

  // Pattern: "5y 3m" or "5 yr 3 mo"
  const shortMatch = text.match(/(\d+)\s*y(?:r|ear)?s?\s*(\d+)?\s*m(?:o|onth)?/i);
  if (shortMatch) {
    return parseInt(shortMatch[1]) + (parseInt(shortMatch[2] || "0") / 12);
  }

  // Default: assume 2 years if can't parse
  return 0;
}

function extractCardLimits(text: string): number[] {
  const limits: number[] = [];
  // Pattern: "$10,000" or "$25,000" near "limit" or "credit limit"
  const matches = text.match(/(?:credit\s*)?limit[:\s]*\$?([\d,]+)/gi);
  if (matches) {
    for (const match of matches) {
      const numStr = match.replace(/[^0-9]/g, "");
      const num = parseInt(numStr);
      if (num >= 500 && num <= 500000) {
        limits.push(num);
      }
    }
  }
  return limits;
}

function extractDerogatoryCount(text: string): number {
  const match = text.match(/derogator(?:y|ies)[:\s]*(\d+)/i);
  return match ? parseInt(match[1]) || 0 : 0;
}

function extractTotalAccounts(text: string): number {
  const match = text.match(/total\s*(?:accounts?|trades?)[:\s]*(\d+)/i);
  return match ? parseInt(match[1]) || 0 : 0;
}
