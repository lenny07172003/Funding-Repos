"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";

import { PLANS } from "./plans";
export { PLANS };

// ─── Auth Helpers ───

async function requirePlatformOwner(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const user = session.user as SessionUser;
  if (user.role !== "PLATFORM_OWNER") throw new Error("Platform owner access required");
  return user;
}

// ─── Platform Dashboard Data ───

export async function getPlatformStats() {
  await requirePlatformOwner();

  const [
    totalAgencies,
    activeAgencies,
    totalUsers,
    totalClients,
    agenciesByPlan,
  ] = await Promise.all([
    prisma.agency.count(),
    prisma.agency.count({ where: { subscriptionStatus: "active" } }),
    prisma.user.count({ where: { role: { not: "PLATFORM_OWNER" } } }),
    prisma.client.count(),
    prisma.agency.groupBy({
      by: ["plan"],
      _count: true,
    }),
  ]);

  // Calculate MRR
  const agencies = await prisma.agency.findMany({
    where: { subscriptionStatus: { in: ["active", "trialing"] } },
    select: { plan: true },
  });
  const mrr = agencies.reduce((sum, a) => {
    const plan = PLANS[a.plan as keyof typeof PLANS];
    return sum + (plan?.price || 0);
  }, 0);

  return {
    totalAgencies,
    activeAgencies,
    totalUsers,
    totalClients,
    mrr,
    planBreakdown: agenciesByPlan,
  };
}

export async function getAllAgencies() {
  await requirePlatformOwner();

  return prisma.agency.findMany({
    include: {
      _count: { select: { subAccounts: true, users: true } },
      users: {
        where: { role: "SUPER_ADMIN" },
        select: { email: true, name: true, lastLoginAt: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getAgencyDetail(agencyId: string) {
  await requirePlatformOwner();

  return prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      subAccounts: {
        include: { _count: { select: { clients: true, users: true } } },
      },
      users: {
        select: { id: true, email: true, name: true, role: true, lastLoginAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function searchUsersGlobal(query: string) {
  await requirePlatformOwner();
  if (!query || query.length < 2) return [];

  return prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: query, mode: "insensitive" } },
        { name: { contains: query, mode: "insensitive" } },
      ],
      role: { not: "PLATFORM_OWNER" },
    },
    include: { agency: { select: { name: true } }, subAccount: { select: { name: true } } },
    take: 20,
  });
}

// ─── Subscription Management ───

export async function updateAgencyPlan(agencyId: string, plan: string) {
  await requirePlatformOwner();
  const planConfig = PLANS[plan as keyof typeof PLANS];
  if (!planConfig) throw new Error("Invalid plan");

  await prisma.agency.update({
    where: { id: agencyId },
    data: {
      plan,
      maxSubAccounts: planConfig.maxSubAccounts,
      maxClients: planConfig.maxClients,
      canResellSubAccounts: planConfig.canResellSubAccounts,
    },
  });
  revalidatePath("/platform");
}

export async function updateAgencySubscriptionStatus(agencyId: string, status: string) {
  await requirePlatformOwner();
  const validStatuses = ["trialing", "active", "past_due", "canceled", "suspended"];
  if (!validStatuses.includes(status)) throw new Error("Invalid status");

  await prisma.agency.update({
    where: { id: agencyId },
    data: { subscriptionStatus: status },
  });
  revalidatePath("/platform");
}

export async function addAiCredits(agencyId: string, credits: number) {
  await requirePlatformOwner();
  if (credits <= 0) throw new Error("Credits must be positive");

  await prisma.agency.update({
    where: { id: agencyId },
    data: { aiCreditsBalance: { increment: credits } },
  });
  revalidatePath("/platform");
}

// ─── Self-Service Signup ───

export async function signupAgency(data: {
  agencyName: string;
  ownerName: string;
  ownerEmail: string;
  ownerPassword: string;
  plan: string;
}) {
  // Validate
  if (!data.agencyName?.trim()) throw new Error("Agency name is required");
  if (!data.ownerName?.trim()) throw new Error("Your name is required");
  if (!data.ownerEmail?.trim()) throw new Error("Email is required");
  if (!data.ownerPassword || data.ownerPassword.length < 8) throw new Error("Password must be at least 8 characters");

  const planConfig = PLANS[data.plan as keyof typeof PLANS];
  if (!planConfig) throw new Error("Invalid plan selected");

  // Check if email already exists
  const existing = await prisma.user.findUnique({ where: { email: data.ownerEmail } });
  if (existing) throw new Error("An account with this email already exists");

  // Create slug from agency name
  const slug = data.agencyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  // Check slug uniqueness
  const slugExists = await prisma.agency.findUnique({ where: { slug } });
  if (slugExists) throw new Error("This agency name is already taken. Please choose a different name.");

  // Create agency
  const agency = await prisma.agency.create({
    data: {
      name: data.agencyName.trim(),
      slug,
      brandName: data.agencyName.trim(),
      plan: data.plan,
      subscriptionStatus: "trialing",
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day trial
      maxSubAccounts: planConfig.maxSubAccounts,
      maxClients: planConfig.maxClients,
      canResellSubAccounts: planConfig.canResellSubAccounts,
      billingEmail: data.ownerEmail,
      aiCreditsBalance: 10, // 10 free AI credits to start
    },
  });

  // Create default sub-account
  const subAccount = await prisma.subAccount.create({
    data: {
      agencyId: agency.id,
      name: "Main Account",
      slug: "main",
    },
  });

  // Create SUPER_ADMIN user
  const passwordHash = await bcrypt.hash(data.ownerPassword, 12);
  await prisma.user.create({
    data: {
      email: data.ownerEmail,
      passwordHash,
      name: data.ownerName.trim(),
      role: "SUPER_ADMIN",
      agencyId: agency.id,
      subAccountId: subAccount.id,
    },
  });

  return { agencyId: agency.id, slug };
}

// ─── Plan Limits Check (called from other actions) ───

export async function checkPlanLimits(agencyId: string): Promise<{
  canAddClient: boolean;
  canAddSubAccount: boolean;
  clientCount: number;
  subAccountCount: number;
  clientLimit: number;
  subAccountLimit: number;
  isActive: boolean;
}> {
  const agency = await prisma.agency.findUnique({
    where: { id: agencyId },
    include: {
      _count: { select: { subAccounts: true } },
    },
  });
  if (!agency) throw new Error("Agency not found");

  const clientCount = await prisma.client.count({
    where: { subAccount: { agencyId } },
  });

  const isActive = agency.subscriptionStatus === "active" || agency.subscriptionStatus === "trialing";
  const canAddClient = isActive && (agency.maxClients === -1 || clientCount < agency.maxClients);
  const canAddSubAccount = isActive && (agency.maxSubAccounts === -1 || agency._count.subAccounts < agency.maxSubAccounts);

  return {
    canAddClient,
    canAddSubAccount,
    clientCount,
    subAccountCount: agency._count.subAccounts,
    clientLimit: agency.maxClients,
    subAccountLimit: agency.maxSubAccounts,
    isActive,
  };
}

// ─── Webhook Handler (processor-agnostic) ───

export async function handlePaymentWebhook(event: {
  type: string;
  agencyId?: string;
  processorCustomerId?: string;
  subscriptionId?: string;
  status?: string;
  currentPeriodEnd?: string;
}) {
  // Find agency by processor ID or agency ID
  let agency;
  if (event.agencyId) {
    agency = await prisma.agency.findUnique({ where: { id: event.agencyId } });
  } else if (event.processorCustomerId) {
    agency = await prisma.agency.findFirst({
      where: { billingProcessorId: event.processorCustomerId },
    });
  }
  if (!agency) return { handled: false, reason: "Agency not found" };

  switch (event.type) {
    case "payment_succeeded":
      await prisma.agency.update({
        where: { id: agency.id },
        data: {
          subscriptionStatus: "active",
          currentPeriodEnd: event.currentPeriodEnd || null,
        },
      });
      break;

    case "payment_failed":
      await prisma.agency.update({
        where: { id: agency.id },
        data: { subscriptionStatus: "past_due" },
      });
      break;

    case "subscription_canceled":
      await prisma.agency.update({
        where: { id: agency.id },
        data: { subscriptionStatus: "canceled" },
      });
      break;

    case "subscription_updated":
      await prisma.agency.update({
        where: { id: agency.id },
        data: {
          subscriptionId: event.subscriptionId || agency.subscriptionId,
          subscriptionStatus: event.status || agency.subscriptionStatus,
          currentPeriodEnd: event.currentPeriodEnd || agency.currentPeriodEnd,
        },
      });
      break;

    default:
      return { handled: false, reason: `Unknown event type: ${event.type}` };
  }

  return { handled: true };
}
