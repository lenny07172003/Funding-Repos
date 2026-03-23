"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import { encrypt, decrypt } from "./crypto";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import type { SessionUser } from "./auth-types";

// ─── Helpers ───

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

/** Get the subAccountId for the current user, required for scoped queries */
async function getSubAccountId(): Promise<string> {
  const user = await getSession();
  if (!user.subAccountId) {
    // SUPER_ADMIN or AGENCY_ADMIN without a sub-account — find their first one
    if (user.agencyId) {
      const first = await prisma.subAccount.findFirst({
        where: { agencyId: user.agencyId },
        orderBy: { createdAt: "asc" },
      });
      if (first) return first.id;
    }
    throw new Error("No sub-account found for this user");
  }
  return user.subAccountId;
}

// ─── Client Actions ───

export async function getClients() {
  const subAccountId = await getSubAccountId();
  return prisma.client.findMany({
    where: { subAccountId },
    include: {
      fundingApplications: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      activityLog: { orderBy: { timestamp: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getClientById(id: string) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id, subAccountId },
    include: {
      fundingApplications: { orderBy: { sortOrder: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      activityLog: { orderBy: { timestamp: "desc" } },
    },
  });
  if (!client) throw new Error("Client not found");
  return client;
}

export async function createClient(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  businessName?: string;
  onboardingStatus?: string;
  onboardedAt?: string;
  agreementSignature?: string;
}) {
  const subAccountId = await getSubAccountId();

  // Check plan limits before creating
  const user = await getSession();
  if (user.agencyId) {
    const agency = await prisma.agency.findUnique({ where: { id: user.agencyId } });
    if (agency) {
      // Check subscription status
      if (agency.subscriptionStatus === "canceled" || agency.subscriptionStatus === "suspended") {
        throw new Error("Your subscription is inactive. Please reactivate to add clients.");
      }
      // Check client limit
      if (agency.maxClients !== -1) {
        const clientCount = await prisma.client.count({
          where: { subAccount: { agencyId: user.agencyId } },
        });
        if (clientCount >= agency.maxClients) {
          throw new Error(`Client limit reached (${agency.maxClients}). Upgrade your plan to add more clients.`);
        }
      }
    }
  }

  const client = await prisma.client.create({
    data: {
      subAccountId,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      phone: data.phone || "",
      businessName: data.businessName || "",
      onboardingStatus: data.onboardingStatus || "not_started",
      onboardedAt: data.onboardedAt || null,
      agreementSignature: data.agreementSignature || null,
    },
  });
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return client;
}

export async function updateClient(
  id: string,
  data: {
    // Personal info
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    ssn?: string;
    dateOfBirth?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    // Business info
    businessName?: string;
    businessAge?: string;
    naicsCode?: string;
    sicCode?: string;
    ein?: string;
    businessAddress?: string;
    businessPhone?: string;
    annualRevenue?: string;
    entityType?: string;
    stateOfIncorporation?: string;
    // Credit
    creditProfile?: string;
    // Onboarding
    onboardingStatus?: string;
    onboardedAt?: string | null;
    onboardingEmailSentAt?: string | null;
    onboardingCompletedSteps?: string;
    // Funding totals
    totalFunded?: number;
    totalApproved?: number;
    // Notes
    notes?: string;
    // Agreement
    agreementSignature?: string | null;
    // Credit monitoring
    creditMonitoringStatus?: string;
    creditMonitoringProvider?: string;
    creditMonitoringUsername?: string;
    creditMonitoringPassword?: string;
    // Referral
    referralPartner?: string;
  }
) {
  const subAccountId = await getSubAccountId();
  // Verify ownership
  const existing = await prisma.client.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Client not found");

  // Encrypt sensitive fields if provided
  const updateData: Record<string, unknown> = { ...data };
  if (data.ssn !== undefined) {
    updateData.ssn = data.ssn ? encrypt(data.ssn) : "";
  }
  if (data.creditMonitoringPassword !== undefined) {
    updateData.creditMonitoringPassword = data.creditMonitoringPassword
      ? encrypt(data.creditMonitoringPassword)
      : "";
  }

  const client = await prisma.client.update({
    where: { id },
    data: updateData,
  });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
  revalidatePath("/admin");
  return client;
}

export async function deleteClientById(id: string) {
  const subAccountId = await getSubAccountId();
  const existing = await prisma.client.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Client not found");
  await prisma.client.delete({ where: { id } });
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
}

/**
 * Recalculate totalFunded and totalApproved from funding applications.
 * Call this after modifying funding applications.
 */
export async function recalculateClientTotals(clientId: string) {
  const apps = await prisma.fundingApplication.findMany({
    where: { clientId },
  });
  const totalFunded = apps
    .filter((a) => a.status === "funded")
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  const totalApproved = apps
    .filter((a) => a.status === "approved" || a.status === "funded")
    .reduce((sum, a) => sum + (a.amount || 0), 0);
  await prisma.client.update({
    where: { id: clientId },
    data: { totalFunded, totalApproved },
  });
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin");
}

// ─── Funding Application Actions ───

export async function createFundingApplication(
  clientId: string,
  data: {
    type: string;
    lender?: string;
    product?: string;
    amount?: number | null;
    status?: string;
    appliedDate?: string;
    notes?: string;
  }
) {
  // Verify client belongs to user's sub-account
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({ where: { id: clientId, subAccountId } });
  if (!client) throw new Error("Client not found");

  // Get next sort order
  const lastApp = await prisma.fundingApplication.findFirst({
    where: { clientId },
    orderBy: { sortOrder: "desc" },
  });

  const app = await prisma.fundingApplication.create({
    data: {
      clientId,
      type: data.type,
      lender: data.lender || "",
      product: data.product || "",
      amount: data.amount ?? null,
      status: data.status || "pending",
      appliedDate: data.appliedDate || new Date().toISOString().split("T")[0],
      notes: data.notes || "",
      sortOrder: (lastApp?.sortOrder ?? -1) + 1,
    },
  });

  await recalculateClientTotals(clientId);
  revalidatePath(`/admin/clients/${clientId}`);
  return app;
}

export async function updateFundingApplication(
  id: string,
  data: {
    type?: string;
    lender?: string;
    product?: string;
    amount?: number | null;
    status?: string;
    appliedDate?: string;
    approvedDate?: string | null;
    fundedDate?: string | null;
    notes?: string;
    sortOrder?: number;
  }
) {
  const app = await prisma.fundingApplication.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!app) throw new Error("Application not found");

  // Verify ownership
  const subAccountId = await getSubAccountId();
  if (app.client.subAccountId !== subAccountId) throw new Error("Forbidden");

  const updated = await prisma.fundingApplication.update({
    where: { id },
    data,
  });

  await recalculateClientTotals(app.clientId);
  revalidatePath(`/admin/clients/${app.clientId}`);
  return updated;
}

export async function deleteFundingApplication(id: string) {
  const app = await prisma.fundingApplication.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!app) throw new Error("Application not found");

  const subAccountId = await getSubAccountId();
  if (app.client.subAccountId !== subAccountId) throw new Error("Forbidden");

  await prisma.fundingApplication.delete({ where: { id } });
  await recalculateClientTotals(app.clientId);
  revalidatePath(`/admin/clients/${app.clientId}`);
}

export async function reorderFundingApplications(clientId: string, orderedIds: string[]) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({ where: { id: clientId, subAccountId } });
  if (!client) throw new Error("Client not found");

  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.fundingApplication.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  revalidatePath(`/admin/clients/${clientId}`);
}

// ─── Document Actions ───

export async function createDocument(
  clientId: string,
  data: {
    name: string;
    type?: string;
    fileName: string;
    fileData: string;
    fileSize: number;
    source?: string;
  }
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({ where: { id: clientId, subAccountId } });
  if (!client) throw new Error("Client not found");

  const doc = await prisma.document.create({
    data: {
      clientId,
      name: data.name,
      type: data.type || "",
      uploadedAt: new Date().toISOString(),
      fileName: data.fileName,
      fileData: data.fileData,
      fileSize: data.fileSize,
      source: data.source || "admin",
    },
  });
  revalidatePath(`/admin/clients/${clientId}`);
  return doc;
}

export async function updateDocumentStatus(id: string, status: string) {
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!doc) throw new Error("Document not found");

  const subAccountId = await getSubAccountId();
  if (doc.client.subAccountId !== subAccountId) throw new Error("Forbidden");

  const updated = await prisma.document.update({
    where: { id },
    data: { status },
  });
  revalidatePath(`/admin/clients/${doc.clientId}`);
  return updated;
}

export async function deleteDocument(id: string) {
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { client: true },
  });
  if (!doc) throw new Error("Document not found");

  const subAccountId = await getSubAccountId();
  if (doc.client.subAccountId !== subAccountId) throw new Error("Forbidden");

  await prisma.document.delete({ where: { id } });
  revalidatePath(`/admin/clients/${doc.clientId}`);
}

// ─── Activity Log Actions ───

export async function addActivityEntry(
  clientId: string,
  data: {
    type: string;
    message: string;
    details?: string;
  }
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({ where: { id: clientId, subAccountId } });
  if (!client) throw new Error("Client not found");

  const entry = await prisma.activityEntry.create({
    data: {
      clientId,
      timestamp: new Date().toISOString(),
      type: data.type,
      message: data.message,
      details: data.details || null,
    },
  });
  revalidatePath(`/admin/clients/${clientId}`);
  return entry;
}

// ─── Lender Actions ───

export async function getLenders() {
  const subAccountId = await getSubAccountId();
  return prisma.lender.findMany({
    where: { subAccountId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createLender(data: {
  name: string;
  logo?: string;
  description?: string;
  website?: string;
}) {
  const subAccountId = await getSubAccountId();
  const lender = await prisma.lender.create({
    data: {
      subAccountId,
      name: data.name,
      logo: data.logo || data.name.charAt(0).toUpperCase(),
      description: data.description || "",
      website: data.website || "",
    },
  });
  revalidatePath("/admin/lenders");
  return lender;
}

export async function updateLender(
  id: string,
  data: {
    name?: string;
    logo?: string;
    description?: string;
    website?: string;
    apiKey?: string;
    apiEndpoint?: string;
    apiSecret?: string;
    status?: string;
    supportedProducts?: string;
    minCreditScore?: number | null;
    maxLoanAmount?: number | null;
    minLoanAmount?: number | null;
    interestRateRange?: string;
    termRange?: string;
    avgApprovalTime?: string;
    totalFunded?: number;
    totalDeals?: number;
    approvalRate?: number | null;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    notes?: string;
    connectedAt?: string | null;
    lastSyncAt?: string | null;
    webhookUrl?: string;
    sandboxMode?: boolean;
  }
) {
  const subAccountId = await getSubAccountId();
  const existing = await prisma.lender.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Lender not found");

  const lender = await prisma.lender.update({
    where: { id },
    data,
  });
  revalidatePath("/admin/lenders");
  return lender;
}

export async function deleteLenderById(id: string) {
  const subAccountId = await getSubAccountId();
  const existing = await prisma.lender.findFirst({ where: { id, subAccountId } });
  if (!existing) throw new Error("Lender not found");
  await prisma.lender.delete({ where: { id } });
  revalidatePath("/admin/lenders");
}

/**
 * Ensure a lender exists by name. Used when adding funding applications
 * that reference a lender name not yet in the database.
 */
export async function ensureLenderByName(name: string) {
  if (!name.trim()) return;
  const subAccountId = await getSubAccountId();
  const existing = await prisma.lender.findFirst({
    where: {
      subAccountId,
      name: { equals: name.trim(), mode: "insensitive" },
    },
  });
  if (!existing) {
    await prisma.lender.create({
      data: {
        subAccountId,
        name: name.trim(),
        logo: name.trim().charAt(0).toUpperCase(),
      },
    });
    revalidatePath("/admin/lenders");
  }
}

/**
 * Sync lenders from client applications: ensure all referenced lender names exist,
 * remove lenders that are unused and unconfigured.
 */
export async function syncLendersFromClients() {
  const subAccountId = await getSubAccountId();

  // Get all lender names used in funding applications
  const clients = await prisma.client.findMany({
    where: { subAccountId },
    include: { fundingApplications: true },
  });
  const usedNames = new Set<string>();
  clients.forEach((c) => {
    c.fundingApplications.forEach((a) => {
      if (a.lender?.trim()) usedNames.add(a.lender.trim().toLowerCase());
    });
  });

  // Get all current lenders
  const lenders = await prisma.lender.findMany({ where: { subAccountId } });

  // Remove unused, unconfigured lenders
  for (const lender of lenders) {
    const nameKey = lender.name.trim().toLowerCase();
    if (!nameKey) continue;
    const isUsed = usedNames.has(nameKey);
    const isConfigured = lender.status === "connected" || lender.apiKey || lender.contactName;
    if (!isUsed && !isConfigured) {
      await prisma.lender.delete({ where: { id: lender.id } });
    }
  }

  // Ensure all used names exist
  for (const name of Array.from(usedNames)) {
    const exists = lenders.some((l) => l.name.trim().toLowerCase() === name);
    if (!exists) {
      await prisma.lender.create({
        data: {
          subAccountId,
          name: name.charAt(0).toUpperCase() + name.slice(1),
          logo: name.charAt(0).toUpperCase(),
        },
      });
    }
  }

  revalidatePath("/admin/lenders");
  revalidatePath("/admin");
}

// ─── Referral Partner Actions ───

export async function getReferralPartners() {
  const subAccountId = await getSubAccountId();
  const partners = await prisma.referralPartner.findMany({
    where: { subAccountId },
    orderBy: { name: "asc" },
  });
  return partners.map((p) => p.name);
}

export async function addReferralPartner(name: string) {
  if (!name.trim()) return;
  const subAccountId = await getSubAccountId();
  await prisma.referralPartner.upsert({
    where: { subAccountId_name: { subAccountId, name: name.trim() } },
    create: { subAccountId, name: name.trim() },
    update: {},
  });
  revalidatePath("/admin/clients");
}

export async function removeReferralPartner(name: string) {
  const subAccountId = await getSubAccountId();
  await prisma.referralPartner.deleteMany({
    where: { subAccountId, name },
  });
  revalidatePath("/admin/clients");
}

// ─── Utility: Decrypt sensitive fields for display ───

export async function getClientWithDecryptedFields(id: string) {
  const client = await getClientById(id);
  return {
    ...client,
    ssn: client.ssn ? decrypt(client.ssn) : "",
    creditMonitoringPassword: client.creditMonitoringPassword
      ? decrypt(client.creditMonitoringPassword)
      : "",
  };
}

// ─── Client Login Account Actions ───

/**
 * Create a login account for a client so they can access the client portal.
 * Admin action — creates a User record with CLIENT role linked to the Client.
 */
export async function createClientLogin(
  clientId: string,
  data: { email: string; password: string }
) {
  const subAccountId = await getSubAccountId();
  const client = await prisma.client.findFirst({
    where: { id: clientId, subAccountId },
    include: { userAccount: true },
  });
  if (!client) throw new Error("Client not found");
  if (client.userAccount) throw new Error("This client already has a login account");

  // Check if email is already in use
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: `${client.firstName} ${client.lastName}`.trim(),
      role: "CLIENT",
      subAccountId,
      clientId,
    },
  });

  revalidatePath(`/admin/clients/${clientId}`);
  return user;
}
