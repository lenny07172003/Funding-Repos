"use server";

import { parseCreditReportText } from "./credit-report-parser";
import type { CreditReportData } from "./stacking-engine";

/**
 * Parse a credit report PDF uploaded by the admin.
 * Extracts text from the PDF, then runs it through the credit report parser
 * to pull out scores, inquiries, existing banks, credit age, and card limits.
 */
export async function parseCreditReportPDF(formData: FormData): Promise<{
  success: boolean;
  data?: CreditReportData;
  rawText?: string;
  error?: string;
}> {
  try {
    const file = formData.get("creditReport") as File;
    if (!file) throw new Error("No file uploaded");

    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please upload a PDF file");
    }

    if (file.size > 10 * 1024 * 1024) {
      throw new Error("File too large. Maximum 10MB.");
    }

    // Convert File to Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Extract text from PDF
    const pdfParseModule = await import("pdf-parse");
    const pdfParse = typeof pdfParseModule === "function" ? pdfParseModule : (pdfParseModule as any).default || pdfParseModule;
    const pdfData = await pdfParse(buffer);
    const rawText = pdfData.text;

    if (!rawText || rawText.trim().length < 50) {
      throw new Error("Could not extract text from this PDF. The file may be image-based (scanned). Please try a text-based credit report export from SmartCredit, Array, or your credit monitoring provider.");
    }

    // Parse the extracted text for credit data
    const creditData = await parseCreditReportText(rawText);

    // Validate we got something useful
    const hasAnyScore = creditData.scores.experian || creditData.scores.equifax || creditData.scores.transUnion;
    if (!hasAnyScore) {
      // Return the raw text so admin can manually enter scores
      return {
        success: false,
        rawText: rawText.substring(0, 3000), // First 3000 chars for reference
        error: "Could not automatically detect credit scores from this PDF. The data has been extracted below — please review and enter scores manually.",
        data: creditData,
      };
    }

    return {
      success: true,
      data: creditData,
      rawText: rawText.substring(0, 1000),
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || "Failed to parse credit report PDF",
    };
  }
}
