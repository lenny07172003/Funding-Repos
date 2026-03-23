import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Test database connection
    const userCount = await prisma.user.count();

    // Find the platform owner
    const owner = await prisma.user.findUnique({
      where: { email: "leneddie0725@gmail.com" },
      select: { id: true, email: true, role: true, name: true, passwordHash: true },
    });

    if (!owner) {
      return NextResponse.json({
        dbConnected: true,
        userCount,
        ownerFound: false,
        error: "Platform owner account not found"
      });
    }

    // Test password
    const testPassword = await bcrypt.compare("FundingCRM2024!", owner.passwordHash);

    return NextResponse.json({
      dbConnected: true,
      userCount,
      ownerFound: true,
      ownerEmail: owner.email,
      ownerRole: owner.role,
      passwordValid: testPassword,
      hashPrefix: owner.passwordHash.substring(0, 7),
      envCheck: {
        hasDbUrl: !!process.env.DATABASE_URL,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasAuthSecret: !!process.env.AUTH_SECRET,
        nextAuthUrl: process.env.NEXTAUTH_URL || "NOT SET",
      },
    });
  } catch (err: any) {
    return NextResponse.json({
      dbConnected: false,
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 3),
    }, { status: 500 });
  }
}
