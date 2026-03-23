"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";

// ─── Auth Helpers ───

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

async function getSubAccountId(): Promise<string> {
  const user = await getSession();
  if (!user.subAccountId) {
    if (user.agencyId) {
      const first = await prisma.subAccount.findFirst({
        where: { agencyId: user.agencyId },
        orderBy: { createdAt: "asc" },
      });
      if (first) return first.id;
    }
    throw new Error("No sub-account found");
  }
  return user.subAccountId;
}

async function checkOutreachCredits(agencyId: string, count: number = 1) {
  const agency = await prisma.agency.findUnique({ where: { id: agencyId } });
  if (!agency) throw new Error("Agency not found");
  if (agency.outreachCreditsBalance < count) {
    throw new Error(`Not enough outreach credits. Need ${count}, have ${agency.outreachCreditsBalance}. Purchase more credits to continue.`);
  }
}

async function consumeOutreachCredits(agencyId: string, count: number = 1) {
  await prisma.agency.update({
    where: { id: agencyId },
    data: {
      outreachCreditsBalance: { decrement: count },
      outreachCreditsUsed: { increment: count },
    },
  });
}

// ─── Banker Prospect CRUD ───

export async function getBankerProspects(filters?: {
  status?: string;
  source?: string;
  search?: string;
}) {
  const subAccountId = await getSubAccountId();
  return prisma.bankerProspect.findMany({
    where: {
      subAccountId,
      ...(filters?.status ? { status: filters.status } : {}),
      ...(filters?.source ? { source: filters.source } : {}),
      ...(filters?.search ? {
        OR: [
          { firstName: { contains: filters.search, mode: "insensitive" as const } },
          { lastName: { contains: filters.search, mode: "insensitive" as const } },
          { bankName: { contains: filters.search, mode: "insensitive" as const } },
          { email: { contains: filters.search, mode: "insensitive" as const } },
        ],
      } : {}),
    },
    include: {
      outreachMessages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createBankerProspect(data: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  linkedinUrl?: string;
  bankName: string;
  branchLocation?: string;
  title?: string;
  department?: string;
  lendingProducts?: string[];
  specialties?: string;
  source?: string;
  notes?: string;
}) {
  const subAccountId = await getSubAccountId();
  return prisma.bankerProspect.create({
    data: {
      subAccountId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email || "",
      phone: data.phone || "",
      linkedinUrl: data.linkedinUrl || "",
      bankName: data.bankName,
      branchLocation: data.branchLocation || "",
      title: data.title || "",
      department: data.department || "",
      lendingProducts: JSON.stringify(data.lendingProducts || []),
      specialties: data.specialties || "",
      source: data.source || "manual",
      notes: data.notes || "",
    },
  });
}

export async function updateBankerProspect(id: string, data: {
  status?: string;
  warmth?: string;
  notes?: string;
  nextFollowUpAt?: string;
  email?: string;
  phone?: string;
  title?: string;
}) {
  const subAccountId = await getSubAccountId();
  const existing = await prisma.bankerProspect.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Prospect not found");

  return prisma.bankerProspect.update({
    where: { id },
    data,
  });
}

export async function deleteBankerProspect(id: string) {
  const subAccountId = await getSubAccountId();
  const existing = await prisma.bankerProspect.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Prospect not found");
  await prisma.bankerProspect.delete({ where: { id } });
}

// ─── Outreach Pipeline Stats ───

export async function getOutreachStats() {
  const subAccountId = await getSubAccountId();
  const prospects = await prisma.bankerProspect.findMany({
    where: { subAccountId },
    select: { status: true },
  });

  const pipeline = {
    prospect: 0,
    contacted: 0,
    replied: 0,
    meeting_scheduled: 0,
    meeting_completed: 0,
    partner: 0,
    declined: 0,
  };

  for (const p of prospects) {
    if (p.status in pipeline) {
      pipeline[p.status as keyof typeof pipeline]++;
    }
  }

  const campaigns = await prisma.outreachCampaign.findMany({
    where: { subAccountId },
    select: { totalSent: true, totalOpened: true, totalReplied: true, totalMeetings: true },
  });

  const totals = campaigns.reduce(
    (acc, c) => ({
      sent: acc.sent + c.totalSent,
      opened: acc.opened + c.totalOpened,
      replied: acc.replied + c.totalReplied,
      meetings: acc.meetings + c.totalMeetings,
    }),
    { sent: 0, opened: 0, replied: 0, meetings: 0 }
  );

  return { pipeline, totals, totalProspects: prospects.length };
}

// ─── Outreach Campaign Management ───

export async function createOutreachCampaign(data: {
  name: string;
  channel?: string;
  messageTemplate: string;
  tone?: string;
  maxFollowUps?: number;
  targetTitle?: string;
  targetProducts?: string;
  targetRegion?: string;
}) {
  const subAccountId = await getSubAccountId();
  return prisma.outreachCampaign.create({
    data: {
      subAccountId,
      name: data.name,
      channel: data.channel || "email",
      messageTemplate: data.messageTemplate,
      tone: data.tone || "professional",
      maxFollowUps: data.maxFollowUps || 3,
      targetTitle: data.targetTitle || "",
      targetProducts: data.targetProducts || "",
      targetRegion: data.targetRegion || "",
    },
  });
}

export async function getOutreachCampaigns() {
  const subAccountId = await getSubAccountId();
  return prisma.outreachCampaign.findMany({
    where: { subAccountId },
    orderBy: { createdAt: "desc" },
  });
}

// ─── AI Message Generation ───

/**
 * Generate a personalized outreach message using AI.
 * Each generation costs 1 outreach credit.
 */
export async function generateOutreachMessage(
  prospectId: string,
  campaignId: string,
  sequenceStep: number
) {
  const user = await getSession();
  if (!user.agencyId) throw new Error("No agency found");

  await checkOutreachCredits(user.agencyId);

  const subAccountId = await getSubAccountId();
  const prospect = await prisma.bankerProspect.findFirst({ where: { id: prospectId, subAccountId } });
  if (!prospect) throw new Error("Prospect not found");

  const campaign = await prisma.outreachCampaign.findFirst({ where: { id: campaignId, subAccountId } });
  if (!campaign) throw new Error("Campaign not found");

  // Get agency branding for personalization
  const agency = await prisma.agency.findUnique({ where: { id: user.agencyId } });

  // Get previous messages for context
  const previousMessages = await prisma.outreachMessage.findMany({
    where: { prospectId, campaignId },
    orderBy: { createdAt: "asc" },
  });

  // Generate AI message
  const message = generateSmartMessage({
    prospect: {
      firstName: prospect.firstName,
      lastName: prospect.lastName,
      bankName: prospect.bankName,
      title: prospect.title,
      department: prospect.department,
      specialties: prospect.specialties,
    },
    campaign: {
      template: campaign.messageTemplate,
      tone: campaign.tone,
    },
    sender: {
      name: user.name,
      company: agency?.brandName || agency?.name || "our company",
    },
    sequenceStep,
    previousMessages: previousMessages.map((m) => ({
      body: m.body,
      reply: m.replyContent,
      step: m.sequenceStep,
    })),
  });

  // Save the message
  const outreachMessage = await prisma.outreachMessage.create({
    data: {
      campaignId,
      prospectId,
      channel: campaign.channel,
      subject: message.subject,
      body: message.body,
      sequenceStep,
      status: "pending",
    },
  });

  // Consume credit
  await consumeOutreachCredits(user.agencyId);

  revalidatePath("/admin/outreach");
  return outreachMessage;
}

/**
 * Send a pending outreach message via email.
 * Uses Resend to deliver the email.
 */
export async function sendOutreachMessage(messageId: string) {
  const subAccountId = await getSubAccountId();
  const message = await prisma.outreachMessage.findUnique({
    where: { id: messageId },
    include: {
      prospect: true,
      campaign: true,
    },
  });
  if (!message) throw new Error("Message not found");
  if (message.prospect.subAccountId !== subAccountId) throw new Error("Forbidden");
  if (!message.prospect.email) throw new Error("Prospect has no email address");

  // Send via Resend
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY not configured");

  const { Resend } = await import("resend");
  const resend = new Resend(apiKey);

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || "Funding CRM <onboarding@resend.dev>",
    to: [message.prospect.email],
    subject: message.subject,
    html: formatOutreachEmail(message.body),
  });

  if (error) throw new Error(`Failed to send: ${error.message}`);

  // Update message status
  await prisma.outreachMessage.update({
    where: { id: messageId },
    data: { status: "sent", sentAt: new Date().toISOString() },
  });

  // Update prospect
  await prisma.bankerProspect.update({
    where: { id: message.prospectId },
    data: {
      status: message.prospect.status === "prospect" ? "contacted" : message.prospect.status,
      lastContactedAt: new Date().toISOString(),
    },
  });

  // Update campaign stats
  await prisma.outreachCampaign.update({
    where: { id: message.campaignId },
    data: {
      totalSent: { increment: 1 },
      creditsUsed: { increment: 1 },
    },
  });

  revalidatePath("/admin/outreach");
  return { success: true };
}

// ─── Convert Banker to Lender ───

/**
 * When a banker becomes a verified partner, convert them to a Lender
 * in the admin's Lender Marketplace.
 */
export async function convertProspectToLender(prospectId: string) {
  const subAccountId = await getSubAccountId();
  const prospect = await prisma.bankerProspect.findFirst({ where: { id: prospectId, subAccountId } });
  if (!prospect) throw new Error("Prospect not found");

  // Create lender from prospect data
  let products: string[] = [];
  try { products = JSON.parse(prospect.lendingProducts || "[]"); } catch {}

  const lender = await prisma.lender.create({
    data: {
      subAccountId,
      name: prospect.bankName,
      description: `${prospect.title} — ${prospect.specialties}`.trim(),
      contactName: `${prospect.firstName} ${prospect.lastName}`.trim(),
      contactEmail: prospect.email,
      contactPhone: prospect.phone,
      website: "",
      supportedProducts: JSON.stringify(products),
      notes: `Sourced via outreach agent. ${prospect.notes}`,
    },
  });

  // Update prospect status
  await prisma.bankerProspect.update({
    where: { id: prospectId },
    data: { status: "partner" },
  });

  revalidatePath("/admin/outreach");
  revalidatePath("/admin/lenders");
  return lender;
}

// ─── AI Message Generation Logic ───

interface MessageContext {
  prospect: {
    firstName: string;
    lastName: string;
    bankName: string;
    title: string;
    department: string;
    specialties: string;
  };
  campaign: {
    template: string;
    tone: string;
  };
  sender: {
    name: string;
    company: string;
  };
  sequenceStep: number;
  previousMessages: { body: string; reply: string; step: number }[];
}

function generateSmartMessage(ctx: MessageContext): { subject: string; body: string } {
  const { prospect, campaign, sender, sequenceStep, previousMessages } = ctx;
  const firstName = prospect.firstName || "there";
  const hasReplied = previousMessages.some((m) => m.reply);

  // Step 1: Initial outreach
  if (sequenceStep === 1) {
    const subject = campaign.template
      ? `${campaign.template.slice(0, 60)}`
      : `Partnership Opportunity — ${sender.company} x ${prospect.bankName}`;

    const body = campaign.template || buildInitialMessage(ctx);
    return { subject, body: personalizeMessage(body, ctx) };
  }

  // Step 2+: Follow-ups
  if (hasReplied) {
    // They replied — generate a contextual response
    const lastReply = previousMessages.filter((m) => m.reply).pop();
    return {
      subject: `Re: Partnership Opportunity — ${sender.company} x ${prospect.bankName}`,
      body: buildReplyFollowUp(ctx, lastReply?.reply || ""),
    };
  }

  // No reply yet — gentle follow-up
  return {
    subject: `Following up — ${sender.company} x ${prospect.bankName}`,
    body: buildNoReplyFollowUp(ctx),
  };
}

function buildInitialMessage(ctx: MessageContext): string {
  const { prospect, sender } = ctx;
  const toneMap: Record<string, string> = {
    professional: `Dear ${prospect.firstName},\n\nI hope this message finds you well. My name is ${sender.name} with ${sender.company}. We specialize in business funding and credit consulting, and I'm reaching out because I believe there's a strong opportunity for us to partner together.\n\nWe regularly work with business owners who are seeking ${prospect.department || "commercial funding solutions"}, and ${prospect.bankName} has an excellent reputation in this space${prospect.specialties ? ` — particularly in ${prospect.specialties}` : ""}.\n\nI'd love to schedule a brief 15-minute call to explore how we can refer qualified, pre-screened clients to you. Our clients come with complete documentation packages and credit profiles ready for review.\n\nWould you be open to a quick conversation this week?\n\nBest regards,\n${sender.name}\n${sender.company}`,
    casual: `Hi ${prospect.firstName},\n\n${sender.name} here from ${sender.company}. We help businesses secure funding, and I'm always looking to connect with strong banking partners like ${prospect.bankName}.\n\nI've got a steady pipeline of qualified business owners looking for ${prospect.department || "funding solutions"}, and I think we could create a great referral relationship.\n\nWould you be open to a quick chat this week? I'd love to learn more about what ${prospect.bankName} is looking for in referred clients so I can send you the right ones.\n\nTalk soon,\n${sender.name}`,
    direct: `${prospect.firstName},\n\nI run ${sender.company} — we do business funding consulting. I have a pipeline of pre-qualified clients looking for ${prospect.department || "commercial lending products"} and I'm looking for banking partners.\n\n${prospect.bankName} is on my short list. I'd like to set up a quick call to discuss a referral partnership.\n\nAre you available for 15 minutes this week?\n\n${sender.name}\n${sender.company}`,
  };

  return toneMap[ctx.campaign.tone] || toneMap.professional;
}

function buildNoReplyFollowUp(ctx: MessageContext): string {
  const { prospect, sender, sequenceStep } = ctx;
  const followUps = [
    `Hi ${prospect.firstName},\n\nJust circling back on my previous message. I know you're busy, so I'll keep this brief — we have qualified business owners looking for ${prospect.department || "funding"} and I'd love to explore a referral partnership with ${prospect.bankName}.\n\n15 minutes on a call is all I'd need. Would any time this week work?\n\nBest,\n${sender.name}`,
    `Hi ${prospect.firstName},\n\nI wanted to reach out one more time. I've been connecting with several banking partners and ${prospect.bankName} keeps coming up as a top recommendation in the space.\n\nIf a referral partnership isn't the right fit right now, no worries at all. But if it is, I'd love to connect.\n\n${sender.name}\n${sender.company}`,
    `Hi ${prospect.firstName},\n\nLast note from me — I don't want to be a bother. If you're ever open to discussing a referral partnership for pre-qualified business funding clients, my door is always open.\n\nWishing you and the team at ${prospect.bankName} continued success.\n\n${sender.name}`,
  ];

  return followUps[Math.min(sequenceStep - 2, followUps.length - 1)] || followUps[followUps.length - 1];
}

function buildReplyFollowUp(ctx: MessageContext, theirReply: string): string {
  const { prospect, sender } = ctx;
  return `Hi ${prospect.firstName},\n\nThank you for getting back to me! I appreciate you taking the time.\n\nI'd love to set up a quick call to discuss the details further. I can work around your schedule — would any time this week work for a 15-minute conversation?\n\nIn the meantime, here's a quick overview of the types of clients I typically refer:\n- Pre-screened with complete credit profiles\n- Business documentation packages prepared\n- Revenue and financial documentation ready\n- Matched to the right lending products before referral\n\nLooking forward to connecting.\n\nBest,\n${sender.name}\n${sender.company}`;
}

function personalizeMessage(template: string, ctx: MessageContext): string {
  return template
    .replace(/\{firstName\}/g, ctx.prospect.firstName)
    .replace(/\{lastName\}/g, ctx.prospect.lastName)
    .replace(/\{bankName\}/g, ctx.prospect.bankName)
    .replace(/\{title\}/g, ctx.prospect.title)
    .replace(/\{senderName\}/g, ctx.sender.name)
    .replace(/\{company\}/g, ctx.sender.company);
}

function formatOutreachEmail(body: string): string {
  const htmlBody = body.replace(/\n/g, "<br/>");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:30px 20px;"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.7;">
${htmlBody}
</td></tr>
</table></td></tr></table></body></html>`;
}
