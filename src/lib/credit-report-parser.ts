"use server";

import type { CreditReportData } from "./stacking-engine";

/**
 * Credit Report Parser — Full Extraction
 *
 * Extracts from credit reports (SmartCredit, Array, PDF):
 * - Scores per bureau
 * - Accounts, late payments, collections, charge-offs, bankruptcies
 * - Closed accounts, inquiries per bureau
 * - Existing banks/creditors
 * - Credit age, personal card limits
 * - Derogatory items detection
 */

const KNOWN_BANKS = [
  "chase", "jpmorgan", "american express", "amex", "bank of america", "boa",
  "wells fargo", "citibank", "citi", "capital one", "discover", "barclays",
  "us bank", "usbank", "pnc", "td bank", "truist", "keybank", "citizens",
  "navy federal", "usaa", "goldman sachs", "marcus", "synchrony",
  "fnbo", "first national", "elan", "valley national", "m&t bank",
  "bethpage", "teachers federal", "service credit union", "paypal",
  "bhg", "apple card", "ally", "sofi", "regions", "fifth third",
  "huntington", "bmo", "santander", "webster", "ameris", "columbia",
  "mercury", "relay", "novo", "bluevine",
];

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
  latePayments?: number;
  collections?: number;
  chargeOffs?: number;
  bankruptcies?: number;
  closedAccounts?: number;
}): Promise<CreditReportData> {
  const totalInquiries = input.experianInquiries + input.equifaxInquiries + input.transUnionInquiries;
  const latePayments = input.latePayments || 0;
  const collections = input.collections || 0;
  const chargeOffs = input.chargeOffs || 0;
  const bankruptcies = input.bankruptcies || 0;
  const hasNegativeItems = collections > 0 || chargeOffs > 0 || bankruptcies > 0 || latePayments > 0;
  const needsCreditRepair = hasNegativeItems || totalInquiries > 16;

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
    latePayments,
    collections,
    chargeOffs,
    bankruptcies,
    closedAccounts: input.closedAccounts || 0,
    totalInquiries,
    hasNegativeItems,
    needsCreditRepair,
  };
}

export async function parseCreditReportText(text: string): Promise<CreditReportData> {
  const normalizedText = text.toLowerCase();

  const scores = extractScores(text);
  const inquiries = extractInquiries(text);
  const existingBanks = extractBanks(normalizedText);
  const creditAgeYears = extractCreditAge(text);
  const personalCardLimits = extractCardLimits(text);
  const derogatoryAccounts = extractDerogatoryCount(text);
  const totalAccounts = extractTotalAccounts(text);
  const latePayments = extractCount(normalizedText, /late\s*payment|past\s*due|30\s*day|60\s*day|90\s*day/gi);
  const collections = extractCount(normalizedText, /collection|collect\s*acc/gi);
  const chargeOffs = extractCount(normalizedText, /charge[\s-]*off|charged[\s-]*off/gi);
  const bankruptcies = extractCount(normalizedText, /bankrupt/gi);
  const closedAccounts = extractCount(normalizedText, /closed|account\s*closed/gi);
  const totalInquiries = inquiries.experian + inquiries.equifax + inquiries.transUnion;

  const hasNegativeItems = collections > 0 || chargeOffs > 0 || bankruptcies > 0 || latePayments > 0;
  const needsCreditRepair = hasNegativeItems || totalInquiries > 16;

  return {
    scores,
    inquiries,
    creditAgeYears,
    existingBanks,
    personalCardLimits,
    derogatoryAccounts,
    totalAccounts,
    latePayments,
    collections,
    chargeOffs,
    bankruptcies,
    closedAccounts,
    totalInquiries,
    hasNegativeItems,
    needsCreditRepair,
  };
}

// ─── Extraction Helpers ───

function extractCount(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function extractScores(text: string): CreditReportData["scores"] {
  const scores: CreditReportData["scores"] = { experian: null, equifax: null, transUnion: null };

  const patterns = [
    { bureau: "experian" as const, regex: /experian[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "equifax" as const, regex: /equifax[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "experian" as const, regex: /\bEX[:\s]+(\d{3})\b/ },
    { bureau: "equifax" as const, regex: /\bEQ[:\s]+(\d{3})\b/ },
    { bureau: "transUnion" as const, regex: /\bTU[:\s]+(\d{3})\b/ },
  ];

  for (const { bureau, regex } of patterns) {
    const match = text.match(regex);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 300 && score <= 850) scores[bureau] = score;
    }
  }

  if (!scores.experian && !scores.equifax && !scores.transUnion) {
    const allScores = text.match(/\b(7\d{2}|6\d{2}|5\d{2}|8\d{2})\b/g);
    if (allScores && allScores.length >= 3) {
      const parsed = allScores.map(Number).filter((s) => s >= 300 && s <= 850);
      if (parsed.length >= 3) {
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

  const patterns = [
    { bureau: "experian" as const, regex: /experian[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "equifax" as const, regex: /equifax[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[\s\S]{0,50}inquir(?:y|ies)[:\s]*(\d+)/i },
  ];

  for (const { bureau, regex } of patterns) {
    const match = text.match(regex);
    if (match) inquiries[bureau] = parseInt(match[1]) || 0;
  }

  // Fallback: count total inquiries section
  if (inquiries.experian === 0 && inquiries.equifax === 0 && inquiries.transUnion === 0) {
    const totalMatch = text.match(/(?:total\s*)?inquir(?:y|ies)[:\s]*(\d+)/i);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]) || 0;
      const split = Math.ceil(total / 3);
      inquiries.experian = split;
      inquiries.equifax = split;
      inquiries.transUnion = total - (split * 2);
    }
  }

  return inquiries;
}

function extractBanks(text: string): string[] {
  const found: string[] = [];
  for (const bank of KNOWN_BANKS) {
    if (text.includes(bank)) {
      const proper = bank.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
      if (!found.includes(proper)) found.push(proper);
    }
  }
  return found;
}

function extractCreditAge(text: string): number {
  const yearMatch = text.match(/(?:average|credit)\s*(?:age|history)[:\s]*(\d+)\s*(?:years?|yrs?)/i);
  if (yearMatch) {
    let years = parseInt(yearMatch[1]);
    const monthMatch = text.match(/(?:average|credit)\s*(?:age|history)[:\s]*\d+\s*(?:years?|yrs?)\s*(?:and\s*)?(\d+)\s*(?:months?|mos?)/i);
    if (monthMatch) years += parseInt(monthMatch[1]) / 12;
    return years;
  }
  const shortMatch = text.match(/(\d+)\s*y(?:r|ear)?s?\s*(\d+)?\s*m(?:o|onth)?/i);
  if (shortMatch) return parseInt(shortMatch[1]) + (parseInt(shortMatch[2] || "0") / 12);
  return 0;
}

function extractCardLimits(text: string): number[] {
  const limits: number[] = [];
  const matches = text.match(/(?:credit\s*)?limit[:\s]*\$?([\d,]+)/gi);
  if (matches) {
    for (const match of matches) {
      const numStr = match.replace(/[^0-9]/g, "");
      const num = parseInt(numStr);
      if (num >= 500 && num <= 500000) limits.push(num);
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
