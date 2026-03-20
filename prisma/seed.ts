import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create default agency
  const agency = await prisma.agency.upsert({
    where: { slug: "default" },
    update: {},
    create: {
      name: "Default Agency",
      slug: "default",
    },
  });

  // Create default sub-account
  const subAccount = await prisma.subAccount.upsert({
    where: { agencyId_slug: { agencyId: agency.id, slug: "main" } },
    update: {},
    create: {
      name: "Main Account",
      slug: "main",
      agencyId: agency.id,
    },
  });

  // Create admin user
  const passwordHash = await bcrypt.hash("admin123", 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@fundingcrm.com" },
    update: { passwordHash },
    create: {
      email: "admin@fundingcrm.com",
      name: "Admin",
      passwordHash,
      role: "SUPER_ADMIN",
      agencyId: agency.id,
      subAccountId: subAccount.id,
    },
  });

  console.log("Seeded:");
  console.log("  Agency:", agency.name);
  console.log("  Sub-account:", subAccount.name);
  console.log("  Admin user:", admin.email);
  console.log("");
  console.log("Login credentials:");
  console.log("  Email: admin@fundingcrm.com");
  console.log("  Password: admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
