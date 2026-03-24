"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

/**
 * Full client onboarding — one action that:
 * 1. Creates client login (email + temp password)
 * 2. Sends comprehensive onboarding email with:
 *    - Portal login credentials
 *    - Agreement review & sign link
 *    - Personal & business details form (via onboarding link)
 *    - Document upload checklist
 */
export async function onboardClientFull(
  clientId: string,
  tempPassword: string
) {
  const user = await getSession();
  if (!user.agencyId || !user.subAccountId) throw new Error("No agency found");

  const [client, agency] = await Promise.all([
    prisma.client.findFirst({
      where: { id: clientId, subAccountId: user.subAccountId },
      include: { userAccount: true },
    }),
    prisma.agency.findUnique({ where: { id: user.agencyId } }),
  ]);

  if (!client) throw new Error("Client not found");
  if (!agency) throw new Error("Agency not found");
  if (!client.email) throw new Error("Client must have an email address");
  if (!tempPassword || tempPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const baseUrl = process.env.NEXTAUTH_URL || "https://funding-repos.vercel.app";
  const clientName = `${client.firstName} ${client.lastName}`.trim() || "Client";
  const companyName = agency.brandName || agency.name;

  // 1. Create login if doesn't exist
  if (!client.userAccount) {
    const existing = await prisma.user.findUnique({ where: { email: client.email } });
    if (existing) throw new Error("A user with this email already exists. Use a different email for the client login.");

    const passwordHash = await bcrypt.hash(tempPassword, 12);
    await prisma.user.create({
      data: {
        email: client.email,
        passwordHash,
        name: clientName,
        role: "CLIENT",
        subAccountId: user.subAccountId,
        clientId,
      },
    });
  }

  // 2. Build links
  const portalLink = `${baseUrl}/login`;
  const agreementLink = `${baseUrl}/sign/${clientId}`;
  const onboardingLink = `${baseUrl}/onboard/${clientId}`;

  // 3. Send comprehensive onboarding email
  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || `${companyName} <onboarding@resend.dev>`,
    to: [client.email],
    subject: `Welcome to ${companyName} — Your Funding Portal is Ready`,
    html: buildOnboardingEmail({
      clientName,
      clientEmail: client.email,
      tempPassword,
      companyName,
      portalLink,
      agreementLink,
      onboardingLink,
      hasAgreement: !!agency.fundingAgreementContent,
    }),
  });

  if (error) throw new Error(`Failed to send: ${error.message}`);

  // 4. Update client record
  await prisma.client.update({
    where: { id: clientId },
    data: {
      onboardingStatus: client.onboardingStatus === "not_started" ? "agreement_sent" : client.onboardingStatus,
      onboardingEmailSentAt: new Date().toISOString(),
      agreementSentAt: agency.fundingAgreementContent ? new Date().toISOString() : null,
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { success: true, sentTo: client.email };
}

function buildOnboardingEmail(data: {
  clientName: string;
  clientEmail: string;
  tempPassword: string;
  companyName: string;
  portalLink: string;
  agreementLink: string;
  onboardingLink: string;
  hasAgreement: boolean;
}) {
  const steps = [];

  // Step 1: Always — Agreement
  if (data.hasAgreement) {
    steps.push({
      num: steps.length + 1,
      title: "Review & Sign Your Funding Agreement",
      desc: "Read through the funding services agreement and sign electronically.",
      link: data.agreementLink,
      linkText: "Review & Sign Agreement",
    });
  }

  // Step 2: Complete business profile
  steps.push({
    num: steps.length + 1,
    title: "Complete Your Business Funding Profile",
    desc: "Fill in your personal details, business information, and credit monitoring setup. This helps us match you with the best funding options.",
    link: data.onboardingLink,
    linkText: "Complete Profile",
  });

  // Step 3: Portal access
  steps.push({
    num: steps.length + 1,
    title: "Access Your Client Portal",
    desc: "Track your funding progress, view your credit data, and manage documents.",
    link: data.portalLink,
    linkText: "Go to Portal",
  });

  const stepsHtml = steps.map((s) => `
    <tr>
      <td style="padding:16px;background:#eff6ff;border-radius:8px;margin-bottom:8px;">
        <table cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="width:36px;vertical-align:top;">
              <div style="width:28px;height:28px;background:#3b82f6;border-radius:50%;color:#fff;text-align:center;line-height:28px;font-size:13px;font-weight:700;">${s.num}</div>
            </td>
            <td style="padding-left:12px;">
              <p style="color:#1e40af;font-size:15px;font-weight:600;margin:0 0 4px;">${s.title}</p>
              <p style="color:#6b7280;font-size:13px;margin:0 0 12px;line-height:1.5;">${s.desc}</p>
              <a href="${s.link}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:10px 24px;border-radius:6px;font-size:14px;font-weight:600;">${s.linkText}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr><td style="height:12px;"></td></tr>
  `).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">

<!-- Header -->
<tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
<h1 style="color:#fff;font-size:24px;margin:0;">Welcome to ${data.companyName}</h1>
<p style="color:#bfdbfe;font-size:14px;margin:8px 0 0;">Your funding journey starts here</p>
</td></tr>

<!-- Body -->
<tr><td style="padding:40px;">
<p style="color:#374151;font-size:16px;line-height:1.6;">Hi <strong>${data.clientName}</strong>,</p>
<p style="color:#6b7280;font-size:15px;line-height:1.6;margin-bottom:24px;">
We're excited to get started on your business funding. Below you'll find everything you need to complete your onboarding. Please go through each step in order.
</p>

<!-- Portal Credentials Box -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
<tr><td style="padding:20px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;">
<p style="color:#166534;font-size:14px;font-weight:600;margin:0 0 8px;">Your Portal Login Credentials</p>
<table cellpadding="0" cellspacing="0">
<tr><td style="color:#6b7280;font-size:14px;padding:2px 0;">Email:</td><td style="color:#111;font-size:14px;font-weight:600;padding:2px 0 2px 12px;">${data.clientEmail}</td></tr>
<tr><td style="color:#6b7280;font-size:14px;padding:2px 0;">Temporary Password:</td><td style="color:#111;font-size:14px;font-weight:600;padding:2px 0 2px 12px;">${data.tempPassword}</td></tr>
</table>
<p style="color:#166534;font-size:12px;margin:8px 0 0;">Please change your password after your first login for security.</p>
</td></tr>
</table>

<!-- Steps -->
<table width="100%" cellpadding="0" cellspacing="0">
${stepsHtml}
</table>

<!-- Documents Checklist -->
<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
<tr><td style="padding:20px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;">
<p style="color:#854d0e;font-size:14px;font-weight:600;margin:0 0 8px;">Documents We'll Need From You</p>
<p style="color:#6b7280;font-size:13px;margin:0 0 8px;line-height:1.5;">Please have the following ready. Your funding representative will collect these during the onboarding process:</p>
<table cellpadding="0" cellspacing="0">
<tr><td style="padding:3px 0;color:#374151;font-size:13px;">☐ Articles of Organization / Certificate of Formation</td></tr>
<tr><td style="padding:3px 0;color:#374151;font-size:13px;">☐ EIN Letter (IRS Confirmation)</td></tr>
<tr><td style="padding:3px 0;color:#374151;font-size:13px;">☐ 3 Most Recent Months of Business Bank Statements</td></tr>
<tr><td style="padding:3px 0;color:#374151;font-size:13px;">☐ Valid Government-Issued Photo ID</td></tr>
<tr><td style="padding:3px 0;color:#374151;font-size:13px;">☐ Business License (if applicable)</td></tr>
</table>
</td></tr>
</table>

</td></tr>

<!-- Footer -->
<tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
<p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;line-height:1.5;">
This email was sent by ${data.companyName}. If you have questions, reply to this email or contact your funding representative.
</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
