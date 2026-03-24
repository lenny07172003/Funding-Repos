"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import type { SessionUser } from "./auth-types";
import type { CreditReportData } from "./stacking-engine";

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

/**
 * After AI analyzes a credit report, generate and send a branded
 * credit analysis email to the client with:
 * - Score summary across all 3 bureaus
 * - Negative items found (collections, charge-offs, late payments, bankruptcies)
 * - Real-world impact examples (business funding, real estate)
 * - FICO score breakdown pie chart
 * - Credit repair recommendation + calendar booking CTA
 */
export async function sendCreditAnalysisEmail(
  clientId: string,
  reportData: CreditReportData
) {
  const user = await getSession();
  if (!user.agencyId) throw new Error("No agency found");

  const [client, agency] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId, subAccount: { agencyId: user.agencyId } },
    }),
    prisma.agency.findUnique({ where: { id: user.agencyId } }),
  ]);

  if (!client) throw new Error("Client not found");
  if (!agency) throw new Error("Agency not found");
  if (!client.email) throw new Error("Client has no email address");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const clientName = `${client.firstName} ${client.lastName}`.trim() || "Client";
  const companyName = agency.brandName || agency.name;
  const brandColor = agency.primaryColor || "#3b82f6";

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || `${companyName} <onboarding@resend.dev>`,
    to: [client.email],
    subject: `${clientName} — Your Credit Analysis Report from ${companyName}`,
    html: buildCreditAnalysisEmail(clientName, companyName, brandColor, reportData),
  });

  if (error) throw new Error(`Failed to send: ${error.message}`);
  return { success: true, sentTo: client.email };
}

function buildCreditAnalysisEmail(
  clientName: string,
  companyName: string,
  brandColor: string,
  data: CreditReportData
): string {
  const scores = [
    { bureau: "Experian", score: data.scores.experian },
    { bureau: "Equifax", score: data.scores.equifax },
    { bureau: "TransUnion", score: data.scores.transUnion },
  ];

  const avgScore = scores.filter((s) => s.score).reduce((a, s) => a + (s.score || 0), 0) / Math.max(scores.filter((s) => s.score).length, 1);
  const roundedAvg = Math.round(avgScore);

  const scoreColor = (s: number | null) => {
    if (!s) return "#9ca3af";
    if (s >= 740) return "#059669";
    if (s >= 670) return "#3b82f6";
    if (s >= 580) return "#f59e0b";
    return "#ef4444";
  };

  const scoreLabel = (s: number | null) => {
    if (!s) return "N/A";
    if (s >= 740) return "Excellent";
    if (s >= 670) return "Good";
    if (s >= 580) return "Fair";
    return "Poor";
  };

  // Score cards
  const scoreCards = scores.map((s) => `
    <td style="width:33%;padding:8px;text-align:center;">
      <div style="background:#f9fafb;border:2px solid ${scoreColor(s.score)};border-radius:12px;padding:16px 8px;">
        <div style="font-size:28px;font-weight:800;color:${scoreColor(s.score)};">${s.score || "—"}</div>
        <div style="font-size:12px;color:${scoreColor(s.score)};font-weight:600;">${scoreLabel(s.score)}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${s.bureau}</div>
      </div>
    </td>
  `).join("");

  // Findings
  const findings: string[] = [];
  if (data.latePayments > 0) findings.push(`<span style="color:#ef4444;">&#9888;</span> <strong>${data.latePayments} Late Payment(s)</strong> detected — these stay on your report for 7 years and significantly impact your score.`);
  if (data.collections > 0) findings.push(`<span style="color:#ef4444;">&#9888;</span> <strong>${data.collections} Collection Account(s)</strong> found — collections signal high risk to lenders and can drop your score 50-100+ points.`);
  if (data.chargeOffs > 0) findings.push(`<span style="color:#ef4444;">&#9888;</span> <strong>${data.chargeOffs} Charge-Off(s)</strong> found — charge-offs are among the most damaging items on a credit report.`);
  if (data.bankruptcies > 0) findings.push(`<span style="color:#ef4444;">&#9888;</span> <strong>${data.bankruptcies} Bankruptcy Record(s)</strong> — bankruptcies remain on your report for 7-10 years and severely limit funding options.`);
  if (data.totalInquiries > 16) findings.push(`<span style="color:#f59e0b;">&#9888;</span> <strong>${data.totalInquiries} Total Inquiries</strong> across bureaus — excessive inquiries signal credit-seeking behavior. Recommend removing non-essential inquiries.`);
  if (data.totalInquiries > 3 && data.totalInquiries <= 16) findings.push(`<span style="color:#f59e0b;">&#8226;</span> <strong>${data.totalInquiries} Inquiries</strong> detected — manageable, but fewer is better for stacking applications.`);
  if (findings.length === 0) findings.push(`<span style="color:#059669;">&#10003;</span> <strong>No major negative items detected.</strong> Your credit profile is in good standing.`);

  const findingsHtml = findings.map((f) => `<tr><td style="padding:8px 12px;font-size:14px;color:#374151;line-height:1.6;border-bottom:1px solid #f3f4f6;">${f}</td></tr>`).join("");

  // FICO Pie Chart (CSS-based since emails can't use JS)
  const ficoFactors = `
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:6px 0;">
          <div style="display:flex;align-items:center;">
            <div style="width:100%;background:#e5e7eb;border-radius:4px;height:24px;overflow:hidden;">
              <div style="width:35%;background:#3b82f6;height:24px;border-radius:4px 0 0 4px;"></div>
            </div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:2px;"><strong>35% Payment History</strong> — On-time payments are the single biggest factor.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <div style="width:100%;background:#e5e7eb;border-radius:4px;height:24px;overflow:hidden;">
            <div style="width:30%;background:#8b5cf6;height:24px;border-radius:4px 0 0 4px;"></div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:2px;"><strong>30% Credit Utilization</strong> — How much of your available credit you're using. Keep under 10%.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <div style="width:100%;background:#e5e7eb;border-radius:4px;height:24px;overflow:hidden;">
            <div style="width:15%;background:#059669;height:24px;border-radius:4px 0 0 4px;"></div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:2px;"><strong>15% Age of Accounts</strong> — Longer credit history = better score.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <div style="width:100%;background:#e5e7eb;border-radius:4px;height:24px;overflow:hidden;">
            <div style="width:10%;background:#f59e0b;height:24px;border-radius:4px 0 0 4px;"></div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:2px;"><strong>10% Types of Credit</strong> — Mix of credit cards, loans, and mortgages is ideal.</div>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;">
          <div style="width:100%;background:#e5e7eb;border-radius:4px;height:24px;overflow:hidden;">
            <div style="width:10%;background:#ef4444;height:24px;border-radius:4px 0 0 4px;"></div>
          </div>
          <div style="font-size:12px;color:#374151;margin-top:2px;"><strong>10% Credit Inquiries</strong> — Each hard inquiry can drop your score 5-10 points.</div>
        </td>
      </tr>
    </table>
  `;

  // Calendar placeholder
  const calendarLink = "#"; // Placeholder — will be replaced with real calendar URL

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:30px 15px;"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,${brandColor},${brandColor}dd);padding:36px 40px;text-align:center;">
<h1 style="color:#fff;font-size:26px;margin:0;font-weight:800;">${companyName}</h1>
<p style="color:rgba(255,255,255,0.8);font-size:15px;margin:10px 0 0;">Credit Analysis Report</p>
</td></tr>

<!-- Greeting -->
<tr><td style="padding:32px 40px 16px;">
<p style="color:#374151;font-size:16px;line-height:1.6;">Hi <strong>${clientName}</strong>,</p>
<p style="color:#6b7280;font-size:15px;line-height:1.6;">
We've completed an in-depth analysis of your credit profile across all three major bureaus. Below is a summary of our findings and personalized recommendations to help you reach your funding goals.
</p>
</td></tr>

<!-- PAGE 1: Credit Scores -->
<tr><td style="padding:0 40px 24px;">
<h2 style="font-size:18px;color:#111;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid ${brandColor};">Your Credit Scores</h2>
<table width="100%" cellpadding="0" cellspacing="0"><tr>${scoreCards}</tr></table>
<p style="text-align:center;font-size:13px;color:#9ca3af;margin-top:8px;">Average Score: <strong style="color:#374151;">${roundedAvg}</strong></p>
</td></tr>

<!-- PAGE 2: What We Found -->
<tr><td style="padding:0 40px 24px;">
<h2 style="font-size:18px;color:#111;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid ${brandColor};">What We Found</h2>
<table width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border-radius:8px;overflow:hidden;">
${findingsHtml}
</table>
</td></tr>

<!-- PAGE 3: Real World Impact -->
<tr><td style="padding:0 40px 24px;">
<h2 style="font-size:18px;color:#111;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid ${brandColor};">How Your Score Affects You — Real World Impact</h2>

<h3 style="font-size:14px;color:#374151;margin:16px 0 8px;">Business Funding (0% APR Credit Cards)</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr style="background:#f9fafb;">
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Score Range</th>
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Result</th>
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Expected Limits</th>
</tr>
<tr style="background:${roundedAvg < 580 ? '#fef2f2' : 'white'};"><td style="padding:10px;font-size:13px;color:#ef4444;font-weight:600;">520 (Poor)</td><td style="padding:10px;font-size:13px;color:#ef4444;">DENIED</td><td style="padding:10px;font-size:13px;color:#ef4444;">$0</td></tr>
<tr style="background:${roundedAvg >= 580 && roundedAvg < 730 ? '#fffbeb' : 'white'};"><td style="padding:10px;font-size:13px;color:#f59e0b;font-weight:600;">680 (Fair)</td><td style="padding:10px;font-size:13px;color:#f59e0b;">Minimal Approval</td><td style="padding:10px;font-size:13px;color:#f59e0b;">$3K-$8K per card</td></tr>
<tr style="background:${roundedAvg >= 730 ? '#f0fdf4' : 'white'};"><td style="padding:10px;font-size:13px;color:#059669;font-weight:600;">750+ (Excellent)</td><td style="padding:10px;font-size:13px;color:#059669;">High Approval Odds</td><td style="padding:10px;font-size:13px;color:#059669;">$10K-$30K+ per card</td></tr>
</table>

<h3 style="font-size:14px;color:#374151;margin:24px 0 8px;">Real Estate / Mortgage</h3>
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
<tr style="background:#f9fafb;">
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Score Range</th>
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Result</th>
<th style="padding:10px;text-align:left;font-size:12px;color:#6b7280;">Interest Rate</th>
</tr>
<tr style="background:${roundedAvg < 580 ? '#fef2f2' : 'white'};"><td style="padding:10px;font-size:13px;color:#ef4444;font-weight:600;">520 (Poor)</td><td style="padding:10px;font-size:13px;color:#ef4444;">DENIED</td><td style="padding:10px;font-size:13px;color:#ef4444;">N/A</td></tr>
<tr style="background:${roundedAvg >= 580 && roundedAvg < 730 ? '#fffbeb' : 'white'};"><td style="padding:10px;font-size:13px;color:#f59e0b;font-weight:600;">680 (Fair)</td><td style="padding:10px;font-size:13px;color:#f59e0b;">Approved</td><td style="padding:10px;font-size:13px;color:#f59e0b;">6%+ Interest Rate</td></tr>
<tr style="background:${roundedAvg >= 730 ? '#f0fdf4' : 'white'};"><td style="padding:10px;font-size:13px;color:#059669;font-weight:600;">750+ (Excellent)</td><td style="padding:10px;font-size:13px;color:#059669;">Approved</td><td style="padding:10px;font-size:13px;color:#059669;">2-3% Interest Rate</td></tr>
</table>
</td></tr>

<!-- PAGE 4: FICO Score Breakdown -->
<tr><td style="padding:0 40px 24px;">
<h2 style="font-size:18px;color:#111;margin:0 0 16px;padding-bottom:8px;border-bottom:2px solid ${brandColor};">The 5 Factors That Make Up Your FICO Score</h2>
${ficoFactors}
</td></tr>

<!-- PAGE 5: Recommendation + CTA -->
${data.needsCreditRepair ? `
<tr><td style="padding:0 40px 32px;">
<div style="background:linear-gradient(135deg,#1e40af,#3b82f6);border-radius:12px;padding:32px;text-align:center;">
<h2 style="color:#fff;font-size:20px;margin:0 0 8px;font-weight:800;">We Can Help You Fix This</h2>
<p style="color:rgba(255,255,255,0.9);font-size:14px;margin:0 0 20px;line-height:1.6;">
Based on our analysis, we recommend enrolling in our credit repair program. We can work on removing negative items, reducing inquiries, and building your profile to qualify for higher funding amounts.
</p>
<p style="color:rgba(255,255,255,0.7);font-size:13px;margin:0 0 20px;">
<strong>What credit repair could unlock for you:</strong><br/>
Higher credit card limits • 0% APR business funding • Better mortgage rates • Lower insurance premiums
</p>
<a href="${calendarLink}" style="display:inline-block;background:#fff;color:#1e40af;text-decoration:none;padding:16px 40px;border-radius:8px;font-size:16px;font-weight:700;">
Book Your Free Consultation
</a>
<p style="color:rgba(255,255,255,0.6);font-size:11px;margin:16px 0 0;">
Schedule a call with our team to discuss your personalized credit repair strategy.
</p>
</div>
</td></tr>
` : `
<tr><td style="padding:0 40px 32px;">
<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;text-align:center;">
<h2 style="color:#166534;font-size:18px;margin:0 0 8px;">Your Credit Profile Looks Strong</h2>
<p style="color:#15803d;font-size:14px;margin:0;line-height:1.6;">
Based on our analysis, you may qualify for business credit card stacking. Your funding representative will be in touch with your personalized funding blueprint.
</p>
</div>
</td></tr>
`}

<!-- Footer -->
<tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
<p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;line-height:1.5;">
This credit analysis was prepared by ${companyName}. This report is for informational purposes only and does not constitute financial advice. Credit scores and data were analyzed from the client's provided credit report.
</p>
</td></tr>

</table></td></tr></table></body></html>`;
}
