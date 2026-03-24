import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const clientId = req.nextUrl.searchParams.get("id");

    if (!clientId) {
      const clients = await prisma.client.findMany({
        take: 5,
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      return NextResponse.json({ clients });
    }

    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: {
        fundingApplications: { orderBy: { sortOrder: "asc" } },
        documents: { orderBy: { createdAt: "desc" } },
        activityLog: { orderBy: { timestamp: "desc" } },
      },
    });

    if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

    return NextResponse.json({
      id: client.id,
      name: `${client.firstName} ${client.lastName}`,
      email: client.email,
      subAccountId: client.subAccountId,
      fundingApps: client.fundingApplications.length,
      documents: client.documents.length,
      activityLog: client.activityLog.length,
      creditProfile: client.creditProfile ? "SET" : "EMPTY",
      agreementSignedAt: client.agreementSignedAt,
      agreementSentAt: client.agreementSentAt,
    });
  } catch (err: any) {
    return NextResponse.json({
      error: err.message,
      stack: err.stack?.split("\n").slice(0, 5),
    }, { status: 500 });
  }
}
