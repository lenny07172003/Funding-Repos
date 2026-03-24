"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

// ─── Admin: Get/Update Agreement Template ───

export async function getAgreementTemplate() {
  const user = await getSession();
  if (!user.agencyId) throw new Error("No agency found");

  const agency = await prisma.agency.findUnique({
    where: { id: user.agencyId },
    select: {
      fundingAgreementTitle: true,
      fundingAgreementContent: true,
      fundingAgreementVersion: true,
      fundingAgreementUpdatedAt: true,
    },
  });
  return agency;
}

export async function updateAgreementTemplate(data: {
  title: string;
  content: string;
}) {
  const user = await getSession();
  if (!user.agencyId) throw new Error("No agency found");
  if (user.role !== "SUPER_ADMIN" && user.role !== "AGENCY_ADMIN") {
    throw new Error("Only Super Admin or Agency Admin can edit the agreement");
  }

  await prisma.agency.update({
    where: { id: user.agencyId },
    data: {
      fundingAgreementTitle: data.title,
      fundingAgreementContent: data.content,
      fundingAgreementVersion: { increment: 1 },
      fundingAgreementUpdatedAt: new Date().toISOString(),
    },
  });

  revalidatePath("/admin/settings/agreement");
}

// ─── Admin: Send Agreement to Client ───

export async function sendAgreementToClient(clientId: string) {
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
  if (!agency.fundingAgreementContent) throw new Error("No agreement template configured. Go to Settings → Agreement to create one.");

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const signingLink = `${process.env.NEXTAUTH_URL || "https://funding-repos.vercel.app"}/sign/${clientId}`;

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const clientName = `${client.firstName} ${client.lastName}`.trim() || "Client";

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Funding CRM <onboarding@resend.dev>",
    to: [client.email],
    subject: `${agency.fundingAgreementTitle} — Please Review & Sign`,
    html: buildAgreementEmail(clientName, agency.brandName || agency.name, agency.fundingAgreementTitle, signingLink),
  });

  if (error) throw new Error(`Failed to send: ${error.message}`);

  // Update client record
  await prisma.client.update({
    where: { id: clientId },
    data: {
      agreementSentAt: new Date().toISOString(),
      onboardingStatus: client.onboardingStatus === "not_started" ? "agreement_sent" : client.onboardingStatus,
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return { success: true, sentTo: client.email };
}

// ─── Public: Get Agreement for Signing (no auth — accessed via link) ───

export async function getAgreementForSigning(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      businessName: true,
      agreementSignature: true,
      agreementSignedAt: true,
      subAccount: {
        select: {
          agency: {
            select: {
              brandName: true,
              name: true,
              fundingAgreementTitle: true,
              fundingAgreementContent: true,
              fundingAgreementVersion: true,
            },
          },
        },
      },
    },
  });

  if (!client) throw new Error("Agreement not found");

  // Mark as viewed
  if (!client.agreementSignedAt) {
    await prisma.client.update({
      where: { id: clientId },
      data: { agreementViewedAt: new Date().toISOString() },
    });
  }

  const agency = client.subAccount?.agency;
  return {
    clientId: client.id,
    clientName: `${client.firstName} ${client.lastName}`.trim(),
    clientEmail: client.email,
    businessName: client.businessName,
    companyName: agency?.brandName || agency?.name || "Funding Company",
    agreementTitle: agency?.fundingAgreementTitle || "BUSINESS FUNDING SERVICES AGREEMENT",
    agreementContent: agency?.fundingAgreementContent || "",
    agreementVersion: agency?.fundingAgreementVersion || 1,
    alreadySigned: !!client.agreementSignedAt,
    signedAt: client.agreementSignedAt,
  };
}

// ─── Public: Submit Signature (no auth — client signs via link) ───

export async function submitAgreementSignature(
  clientId: string,
  data: {
    fullName: string;
    businessName: string;
    signatureData: string; // base64 canvas image
    dateSigned: string; // Date the client selected
  }
) {
  if (!clientId || !data.fullName?.trim() || !data.signatureData) {
    throw new Error("Full name and signature are required");
  }

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      subAccount: {
        include: {
          agency: {
            select: {
              brandName: true,
              name: true,
              fundingAgreementTitle: true,
              fundingAgreementContent: true,
              fundingAgreementVersion: true,
            },
          },
        },
      },
    },
  });
  if (!client) throw new Error("Client not found");

  const agency = client.subAccount?.agency;
  const now = new Date();

  // Snapshot the FULL agreement at signing time — locked forever
  const signature = JSON.stringify({
    fullName: data.fullName.trim(),
    businessName: data.businessName.trim(),
    signatureData: data.signatureData,
    dateSigned: data.dateSigned,
    timeSigned: now.toISOString(),
    timestamp: now.getTime(),
    completedAt: now.toISOString(),
    ipAddress: "client-web",
    agreementVersion: agency?.fundingAgreementVersion || 1,
    agreementTitle: agency?.fundingAgreementTitle || "BUSINESS FUNDING SERVICES AGREEMENT",
    agreementContent: agency?.fundingAgreementContent || "",
    companyName: agency?.brandName || agency?.name || "",
  });

  await prisma.client.update({
    where: { id: clientId },
    data: {
      agreementSignature: signature,
      agreementSignedAt: now.toISOString(),
      onboardingStatus: "agreement_signed",
      onboardingCompletedSteps: JSON.stringify({
        ...JSON.parse(client.onboardingCompletedSteps || "{}"),
        agreement: true,
      }),
    },
  });

  return { success: true };
}

// ─── Email Template ───

function buildAgreementEmail(clientName: string, companyName: string, agreementTitle: string, signingLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:40px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
<tr><td style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:32px 40px;text-align:center;">
<h1 style="color:#fff;font-size:22px;margin:0;">${companyName}</h1>
<p style="color:#bfdbfe;font-size:14px;margin:8px 0 0;">Funding Agreement Ready for Review</p>
</td></tr>
<tr><td style="padding:40px;">
<p style="color:#374151;font-size:16px;line-height:1.6;">Hi <strong>${clientName}</strong>,</p>
<p style="color:#6b7280;font-size:15px;line-height:1.6;">
Your <strong>${agreementTitle}</strong> is ready for your review and signature. Please read through the agreement carefully and sign electronically to proceed with your funding services.
</p>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td align="center">
<a href="${signingLink}" style="display:inline-block;background:#1e40af;color:#fff;text-decoration:none;padding:16px 48px;border-radius:8px;font-size:16px;font-weight:600;">
Review & Sign Agreement
</a>
</td></tr></table>
<p style="color:#9ca3af;font-size:13px;text-align:center;line-height:1.5;">
Or copy this link: <a href="${signingLink}" style="color:#3b82f6;word-break:break-all;">${signingLink}</a>
</p>
<div style="margin-top:32px;padding:16px;background:#eff6ff;border-radius:8px;">
<p style="color:#1e40af;font-size:14px;font-weight:600;margin:0 0 8px;">What you'll need:</p>
<ul style="color:#6b7280;font-size:14px;margin:0;padding-left:20px;line-height:1.8;">
<li>Your full legal name</li>
<li>Business name</li>
<li>Your signature (drawn or typed)</li>
</ul>
</div>
</td></tr>
<tr><td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
<p style="color:#9ca3af;font-size:12px;margin:0;text-align:center;">
This email was sent by ${companyName}. If you did not expect this, please disregard.
</p>
</td></tr>
</table></td></tr></table></body></html>`;
}
