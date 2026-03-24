"use server";

/**
 * PDF Credit Report parsing is now handled by the API route at
 * /api/parse-credit-report to avoid DOMMatrix/Edge Runtime issues.
 *
 * This file is kept for backward compatibility but the actual parsing
 * happens in the API route which runs in Node.js runtime.
 */

export async function parseCreditReportPDF(formData: FormData): Promise<{
  success: boolean;
  data?: any;
  rawText?: string;
  error?: string;
}> {
  // Redirect to API route — this server action is deprecated
  // The client-side code now calls /api/parse-credit-report directly
  return {
    success: false,
    error: "Please use the Upload Credit Report button which calls the API route directly.",
  };
}
