import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Allow up to 120 seconds for large 100-200 page PDFs

/**
 * API route to parse credit report PDFs.
 * Uses an API route instead of a server action to avoid Edge Runtime issues
 * with pdf-parse and DOMMatrix. Runs in Node.js runtime.
 */
export async function POST(req: NextRequest) {
  try {
    // Auth check
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("creditReport") as File;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Please upload a PDF file" }, { status: 400 });
    }

    // 50MB limit for large reports
    if (file.size > 50 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large. Maximum 50MB." }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extract text from PDF — use pdf-parse with canvas workaround
    let rawText = "";
    try {
      // Prevent pdf-parse from trying to load canvas/DOMMatrix
      const pdfParse = require("pdf-parse/lib/pdf-parse");
      const pdfData = await pdfParse(buffer, {
        // Process ALL pages — no limit. Large reports (100-200 pages) take 10-30s
      });
      rawText = pdfData.text || "";
    } catch (pdfErr: any) {
      // Fallback: try basic extraction
      try {
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(buffer);
        rawText = pdfData.text || "";
      } catch {
        return NextResponse.json({
          success: false,
          error: `Could not read this PDF: ${pdfErr.message}. Try exporting your credit report as a text-based PDF from SmartCredit or Array.`,
        });
      }
    }

    if (!rawText || rawText.trim().length < 30) {
      return NextResponse.json({
        success: false,
        error: "Could not extract text from this PDF. The file may be image-based (scanned). Please use a text-based credit report export from SmartCredit, Array, or your credit monitoring provider.",
      });
    }

    // Parse the extracted text
    const data = parseReportText(rawText);

    const hasAnyScore = data.scores.experian || data.scores.equifax || data.scores.transUnion;

    return NextResponse.json({
      success: hasAnyScore,
      data,
      rawTextPreview: rawText.substring(0, hasAnyScore ? 500 : 2000),
      pagesProcessed: "all pages",
      error: hasAnyScore ? null : "Could not detect credit scores automatically. Data extracted below — please enter scores manually.",
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to process credit report",
    }, { status: 500 });
  }
}

// ─── Text Parsing (runs server-side, no DOMMatrix needed) ───

const KNOWN_BANKS = [
  "chase", "jpmorgan", "american express", "amex", "bank of america", "boa",
  "wells fargo", "citibank", "citi", "capital one", "discover", "barclays",
  "us bank", "usbank", "pnc", "td bank", "truist", "keybank", "citizens",
  "navy federal", "usaa", "goldman sachs", "marcus", "synchrony",
  "fnbo", "first national", "elan", "valley national", "m&t bank",
  "bethpage", "teachers federal", "service credit union", "paypal",
  "bhg", "apple card", "ally", "sofi", "regions", "fifth third",
  "huntington", "bmo", "santander", "webster", "ameris",
];

function parseReportText(text: string) {
  const lower = text.toLowerCase();

  const scores = extractScores(text);
  const inquiries = extractInquiries(text);
  const existingBanks = extractBanks(lower);
  const creditAgeYears = extractCreditAge(text);
  const personalCardLimits = extractCardLimits(text);
  const derogatoryAccounts = extractNamedCount(lower, /derogator(?:y|ies)[:\s]*(\d+)/i);
  const totalAccounts = extractNamedCount(lower, /total\s*(?:accounts?|trades?)[:\s]*(\d+)/i);
  const latePayments = countOccurrences(lower, /late\s*payment|past\s*due|30\s*days?\s*late|60\s*days?\s*late|90\s*days?\s*late/gi);
  const collections = countOccurrences(lower, /collection|collect\s*acc|in\s*collections/gi);
  const chargeOffs = countOccurrences(lower, /charge[\s-]*off|charged[\s-]*off/gi);
  const bankruptcies = countOccurrences(lower, /bankrupt(?:cy|cies)?/gi);
  const closedAccounts = countOccurrences(lower, /account\s*closed|closed\s*account|status[:\s]*closed/gi);
  const totalInquiries = inquiries.experian + inquiries.equifax + inquiries.transUnion;
  const hasNegativeItems = collections > 0 || chargeOffs > 0 || bankruptcies > 0 || latePayments > 0;
  const needsCreditRepair = hasNegativeItems || totalInquiries > 16;

  return {
    scores, inquiries, creditAgeYears, existingBanks, personalCardLimits,
    derogatoryAccounts, totalAccounts, latePayments, collections, chargeOffs,
    bankruptcies, closedAccounts, totalInquiries, hasNegativeItems, needsCreditRepair,
  };
}

function countOccurrences(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function extractNamedCount(text: string, pattern: RegExp): number {
  const match = text.match(pattern);
  return match ? parseInt(match[1]) || 0 : 0;
}

function extractScores(text: string) {
  const scores: { experian: number | null; equifax: number | null; transUnion: number | null } = { experian: null, equifax: null, transUnion: null };

  const patterns = [
    { bureau: "experian" as const, regex: /experian[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "equifax" as const, regex: /equifax[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[:\s]*(?:score[:\s]*)?\s*(\d{3})/i },
    { bureau: "experian" as const, regex: /\bEX[:\s]+(\d{3})\b/ },
    { bureau: "equifax" as const, regex: /\bEQ[:\s]+(\d{3})\b/ },
    { bureau: "transUnion" as const, regex: /\bTU[:\s]+(\d{3})\b/ },
  ];

  for (const { bureau, regex } of patterns) {
    if (scores[bureau]) continue;
    const match = text.match(regex);
    if (match) {
      const score = parseInt(match[1]);
      if (score >= 300 && score <= 850) scores[bureau] = score;
    }
  }

  // Fallback: look for 3 consecutive scores
  if (!scores.experian && !scores.equifax && !scores.transUnion) {
    const allScores = text.match(/\b([3-8]\d{2})\b/g);
    if (allScores) {
      const valid = allScores.map(Number).filter((s) => s >= 300 && s <= 850);
      const unique = Array.from(new Set(valid));
      if (unique.length >= 3) {
        scores.experian = unique[0];
        scores.equifax = unique[1];
        scores.transUnion = unique[2];
      }
    }
  }

  return scores;
}

function extractInquiries(text: string) {
  const inquiries = { experian: 0, equifax: 0, transUnion: 0 };
  const patterns = [
    { bureau: "experian" as const, regex: /experian[\s\S]{0,80}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "equifax" as const, regex: /equifax[\s\S]{0,80}inquir(?:y|ies)[:\s]*(\d+)/i },
    { bureau: "transUnion" as const, regex: /trans\s*union[\s\S]{0,80}inquir(?:y|ies)[:\s]*(\d+)/i },
  ];
  for (const { bureau, regex } of patterns) {
    const match = text.match(regex);
    if (match) inquiries[bureau] = parseInt(match[1]) || 0;
  }
  // Fallback
  if (inquiries.experian === 0 && inquiries.equifax === 0 && inquiries.transUnion === 0) {
    const totalMatch = text.match(/(?:total\s*)?inquir(?:y|ies)[:\s]*(\d+)/i);
    if (totalMatch) {
      const total = parseInt(totalMatch[1]) || 0;
      const split = Math.ceil(total / 3);
      inquiries.experian = split;
      inquiries.equifax = split;
      inquiries.transUnion = Math.max(0, total - (split * 2));
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
    const monthMatch = text.match(/(?:average|credit)\s*(?:age|history)[:\s]*\d+\s*(?:years?|yrs?)[\s,]*(?:and\s*)?(\d+)\s*(?:months?|mos?)/i);
    if (monthMatch) years += parseInt(monthMatch[1]) / 12;
    return years;
  }
  return 0;
}

function extractCardLimits(text: string): number[] {
  const limits: number[] = [];
  const matches = text.match(/(?:credit\s*)?limit[:\s]*\$?([\d,]+)/gi);
  if (matches) {
    for (const match of matches) {
      const num = parseInt(match.replace(/[^0-9]/g, ""));
      if (num >= 500 && num <= 500000) limits.push(num);
    }
  }
  return limits;
}
