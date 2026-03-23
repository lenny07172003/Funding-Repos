"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import { decrypt } from "./crypto";
import bcrypt from "bcryptjs";
import type { SessionUser } from "./auth-types";

/**
 * Server actions for the client portal.
 * All actions are scoped to the logged-in client's data.
 */

async function getClientSession(): Promise<{ userId: string; clientId: string }> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const user = session.user as SessionUser;
  if (!user.clientId) throw new Error("Not a client account");
  return { userId: user.id, clientId: user.clientId };
}

export async function getMyProfile() {
  const { clientId } = await getClientSession();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
      address: true,
      city: true,
      state: true,
      zip: true,
      businessName: true,
      businessAge: true,
      ein: true,
      entityType: true,
      annualRevenue: true,
      onboardingStatus: true,
    },
  });
  if (!client) throw new Error("Client not found");
  return client;
}

export async function getMyCreditProfile() {
  const { clientId } = await getClientSession();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      creditProfile: true,
      creditMonitoringStatus: true,
      creditMonitoringProvider: true,
    },
  });
  if (!client) throw new Error("Client not found");

  let profile;
  try {
    profile = JSON.parse(client.creditProfile || "{}");
  } catch {
    profile = {};
  }

  return {
    creditProfile: profile,
    monitoringStatus: client.creditMonitoringStatus,
    monitoringProvider: client.creditMonitoringProvider,
  };
}

export async function getMyFundingApplications() {
  const { clientId } = await getClientSession();
  return prisma.fundingApplication.findMany({
    where: { clientId },
    orderBy: { sortOrder: "asc" },
  });
}

export async function getMyDocuments() {
  const { clientId } = await getClientSession();
  return prisma.document.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      type: true,
      uploadedAt: true,
      status: true,
      fileName: true,
      fileSize: true,
      source: true,
      // Exclude fileData for listing — fetch individually for download
    },
  });
}

export async function changeMyPassword(currentPassword: string, newPassword: string) {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const userId = (session.user as SessionUser).id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("User not found");

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new Error("Current password is incorrect");

  if (newPassword.length < 8) throw new Error("New password must be at least 8 characters");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });
}

export async function getMyFundingSummary() {
  const { clientId } = await getClientSession();
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      totalFunded: true,
      totalApproved: true,
    },
  });
  if (!client) throw new Error("Client not found");
  return client;
}
