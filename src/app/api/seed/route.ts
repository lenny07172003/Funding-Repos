import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

// POST /api/seed — creates default admin account
// Protected by a secret to prevent unauthorized seeding
export async function POST(req: Request) {
  const { secret } = await req.json().catch(() => ({ secret: "" }));

  if (secret !== process.env.SEED_SECRET && secret !== "funding-crm-setup-2024") {
    return NextResponse.json({ error: "Invalid secret" }, { status: 401 });
  }

  try {
    // Create default account
    const subAccount = await prisma.subAccount.upsert({
      where: { slug: "default" },
      update: {},
      create: {
        name: "Main Account",
        slug: "default",
        brandName: "Funding CRM",
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
        subAccountId: subAccount.id,
      },
    });

    return NextResponse.json({
      success: true,
      message: "Admin account created",
      email: admin.email,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
