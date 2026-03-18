/**
 * Seed script — creates initial super admin, agency, and sub-account.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Default credentials:
 *   Email:    admin@fundingcrm.com
 *   Password: Admin123!
 *
 * CHANGE THE PASSWORD after first login!
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Prisma v7 reads DATABASE_URL from the prisma.config.ts / env automatically
const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...\n");

  // 1. Create default agency
  const agency = await prisma.agency.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Funding CRM",
      slug: "default",
      brandName: "Funding CRM",
      primaryColor: "#3b82f6",
    },
  });
  console.log(`Agency: ${agency.name} (${agency.id})`);

  // 2. Create default sub-account
  const subAccount = await prisma.subAccount.upsert({
    where: { agencyId_slug: { agencyId: agency.id, slug: "main" } },
    update: {},
    create: {
      agencyId: agency.id,
      name: "Main Account",
      slug: "main",
    },
  });
  console.log(`Sub-Account: ${subAccount.name} (${subAccount.id})`);

  // 3. Create super admin user
  const passwordHash = await bcrypt.hash("Admin123!", 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@fundingcrm.com" },
    update: {},
    create: {
      email: "admin@fundingcrm.com",
      passwordHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
      agencyId: agency.id,
      subAccountId: subAccount.id,
    },
  });
  console.log(`Super Admin: ${superAdmin.email} (${superAdmin.id})`);

  console.log("\n--- Seed complete ---");
  console.log("\nLogin credentials:");
  console.log("  Email:    admin@fundingcrm.com");
  console.log("  Password: Admin123!");
  console.log("\n  CHANGE YOUR PASSWORD AFTER FIRST LOGIN!");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
