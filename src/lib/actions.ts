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

// ─── Sub-Account Actions (Super Admin manages white-label accounts) ───

export async function getSubAccounts() {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  return prisma.subAccount.findMany({
    include: { _count: { select: { users: true, clients: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSubAccount(data: { name: string; slug?: string }) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  const slug = data.slug || slugify(data.name);
  const account = await prisma.subAccount.create({
    data: { name: data.name, slug, brandName: data.name },
  });
  revalidatePath("/admin/agencies");
  return account;
}

export async function deleteSubAccount(subAccountId: string) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  await prisma.subAccount.delete({ where: { id: subAccountId } });
  revalidatePath("/admin/agencies");
}

export async function updateSubAccountBranding(
  subAccountId: string,
  data: {
    brandName?: string;
    brandLogo?: string;
    brandFavicon?: string;
    primaryColor?: string;
    customDomain?: string;
  }
) {
  const user = await getSession();
  if (user.role !== "SUPER_ADMIN" && user.subAccountId !== subAccountId) throw new Error("Forbidden");
  const account = await prisma.subAccount.update({
    where: { id: subAccountId },
    data,
  });
  revalidatePath("/admin/agencies");
  revalidatePath("/admin/settings/branding");
  return account;
}

// ─── User Actions ───

export async function getUsers(subAccountId?: string) {
  const user = await getSession();
  if (user.role === "SUPER_ADMIN") {
    return prisma.user.findMany({
      where: subAccountId ? { subAccountId } : undefined,
      include: { subAccount: true },
      orderBy: { createdAt: "desc" },
    });
  }
  // ACCOUNT_ADMIN can only see their own sub-account's users
  return prisma.user.findMany({
    where: { subAccountId: user.subAccountId! },
    include: { subAccount: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createUser(data: {
  email: string;
  password: string;
  name: string;
  role: string;
  subAccountId: string;
}) {
  const user = await getSession();
  // Only SUPER_ADMIN can create SUPER_ADMIN users
  if (data.role === "SUPER_ADMIN" && user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
  if (user.role === "ACCOUNT_ADMIN") throw new Error("Forbidden");

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) throw new Error("A user with this email already exists");

  const passwordHash = await bcrypt.hash(data.password, 12);
  const newUser = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: data.role,
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

  // Fetch the sub-account branding for white-label
  let branding = null;
  if (user.subAccountId) {
    branding = await prisma.subAccount.findUnique({
      where: { id: user.subAccountId },
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

export async function getSubAccountForUser() {
  const user = await getSession();
  if (!user.subAccountId) return null;
  return prisma.subAccount.findUnique({
    where: { id: user.subAccountId },
  });
}
