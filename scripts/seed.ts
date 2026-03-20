/**
 * Seed script — creates initial super admin and default account.
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

  // 1. Create default account
  const subAccount = await prisma.subAccount.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Funding CRM",
      slug: "default",
      brandName: "Funding CRM",
      primaryColor: "#3b82f6",
    },
  });
  console.log(`Account: ${subAccount.name} (${subAccount.id})`);

  // 2. Create super admin user
  const passwordHash = await bcrypt.hash("Admin123!", 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: "admin@fundingcrm.com" },
    update: {},
    create: {
      email: "admin@fundingcrm.com",
      passwordHash,
      name: "Super Admin",
      role: "SUPER_ADMIN",
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
