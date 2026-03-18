"use server";

import { prisma } from "./db";
import { auth } from "./auth";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import type { SessionUser } from "./auth-types";

// ─── Helpers ───

async function getSession(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  return session.user as SessionUser;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Agency Actions ───

export async function getAgencies() {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  return prisma.agency.findMany({
    include: { _count: { select: { subAccounts: true, users: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createAgency(data: { name: string; slug?: string }) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  const slug = data.slug || slugify(data.name);
  const agency = await prisma.agency.create({
    data: { name: data.name, slug, brandName: data.name },
  });
  // Create a default sub-account
  await prisma.subAccount.create({
    data: { agencyId: agency.id, name: "Main Account", slug: "main" },
  });
  revalidatePath("/admin/agencies");
  return agency;
}

export async function updateAgencyBranding(
  agencyId: string,
  data: {
    brandName?: string;
    brandLogo?: string;
    brandFavicon?: string;
    primaryColor?: string;
    customDomain?: string;
  }
) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN" && user.agencyId !== agencyId) throw new Error("Forbidden");
  const agency = await prisma.agency.update({
    where: { id: agencyId },
    data,
  });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/settings/branding");
  return agency;
}

export async function deleteAgency(agencyId: string) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  await prisma.agency.delete({ where: { id: agencyId } });
  revalidatePath("/admin/agencies");
}

// ─── Sub-Account Actions ───

export async function getSubAccounts(agencyId: string) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN" && user.agencyId !== agencyId) throw new Error("Forbidden");
  return prisma.subAccount.findMany({
    where: { agencyId },
    include: { _count: { select: { users: true, clients: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSubAccount(agencyId: string, data: { name: string; slug?: string }) {
  const user = await getSession();
  if (user.role === "ACCOUNT_ADMIN") throw new Error("Forbidden");
  if (user.role === "AGENCY_ADMIN" && user.agencyId !== agencyId) throw new Error("Forbidden");
  const slug = data.slug || slugify(data.name);
  const account = await prisma.subAccount.create({
    data: { agencyId, name: data.name, slug },
  });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/accounts");
  return account;
}

export async function deleteSubAccount(subAccountId: string) {
  const user = await getSession();
  if (user.role === "ACCOUNT_ADMIN") throw new Error("Forbidden");
  const account = await prisma.subAccount.findUnique({ where: { id: subAccountId } });
  if (!account) throw new Error("Not found");
  if (user.role === "AGENCY_ADMIN" && user.agencyId !== account.agencyId) throw new Error("Forbidden");
  await prisma.subAccount.delete({ where: { id: subAccountId } });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/accounts");
}

// ─── User Actions ───

export async function getUsers(subAccountId?: string) {
  const user = await getSession();
  if (user.role === "SUPER_ADMIN") {
    return prisma.user.findMany({
      where: subAccountId ? { subAccountId } : undefined,
      include: { agency: true, subAccount: true },
      orderBy: { createdAt: "desc" },
    });
  }
  if (user.role === "AGENCY_ADMIN") {
    return prisma.user.findMany({
      where: { agencyId: user.agencyId!, ...(subAccountId ? { subAccountId } : {}) },
      include: { agency: true, subAccount: true },
      orderBy: { createdAt: "desc" },
    });
  }
  // ACCOUNT_ADMIN can only see their own sub-account's users
  return prisma.user.findMany({
    where: { subAccountId: user.subAccountId! },
    include: { agency: true, subAccount: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: string;
  agencyId: string;
  subAccountId: string;
}) {
  const user = await getSession();
  // Only SUPER_ADMIN can create SUPER_ADMIN or AGENCY_ADMIN
  if (data.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  if (data.role === "AGENCY_ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  if (user.role === "ACCOUNT_ADMIN") throw new Error("Forbidden");
  if (user.role === "AGENCY_ADMIN" && user.agencyId !== data.agencyId) throw new Error("Forbidden");

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
      agencyId: data.agencyId,
      subAccountId: data.subAccountId,
    },
  });
  revalidatePath("/admin/settings/team");
  revalidatePath("/admin/agencies");
  return newUser;
}

export async function deleteUser(userId: string) {
  const user = await getSession();
  if (userId === user.id) throw new Error("Cannot delete yourself");
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new Error("User not found");
  if (target.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  if (user.role === "AGENCY_ADMIN" && target.agencyId !== user.agencyId) throw new Error("Forbidden");
  if (user.role === "ACCOUNT_ADMIN") throw new Error("Forbidden");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/settings/team");
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const session = await getSession();
  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user) throw new Error("User not found");

  const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!isValid) throw new Error("Current password is incorrect");

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.id },
    data: { passwordHash },
  });
}

// ─── Session Info ───

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;
  const user = session.user as SessionUser;

  // Also fetch the agency branding for white-label
  let branding = null;
  if (user.agencyId) {
    branding = await prisma.agency.findUnique({
      where: { id: user.agencyId },
      select: {
        brandName: true,
        brandLogo: true,
        primaryColor: true,
        brandFavicon: true,
      },
    });
  }

  return { ...user, branding };
}

export async function getAgencyForUser() {
  const user = await getSession();
  if (!user.agencyId) return null;
  return prisma.agency.findUnique({
    where: { id: user.agencyId },
    include: {
      subAccounts: {
        include: { _count: { select: { users: true, clients: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}
