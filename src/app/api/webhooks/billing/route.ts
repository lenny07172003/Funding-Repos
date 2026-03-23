import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Processor-agnostic billing webhook endpoint.
 *
 * POST /api/webhooks/billing
 *
 * Accepts events from any payment processor (Soar Payments, TailoredPay,
 * Easy Pay Direct, or Stripe). Map the processor's event format to our
 * standard format before calling handlePaymentWebhook().
 *
 * Standard event format:
 * {
 *   type: "payment_succeeded" | "payment_failed" | "subscription_canceled" | "subscription_updated",
 *   agencyId?: string,
 *   processorCustomerId?: string,
 *   subscriptionId?: string,
 *   status?: string,
 *   currentPeriodEnd?: string (ISO date)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    // Verify webhook secret (set this in your payment processor's webhook config)
    const webhookSecret = process.env.BILLING_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get("x-webhook-signature") || req.headers.get("x-signature");
      if (signature !== webhookSecret) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = await req.json();

    // Map processor-specific format to our standard format
    // This is where you'd add processor-specific parsing
    const event = {
      type: body.type || body.event_type || body.eventType || "",
      agencyId: body.agencyId || body.metadata?.agencyId || "",
      processorCustomerId: body.processorCustomerId || body.customer_id || body.customerId || "",
      subscriptionId: body.subscriptionId || body.subscription_id || "",
      status: body.status || "",
      currentPeriodEnd: body.currentPeriodEnd || body.current_period_end || "",
    };

    // Find agency
    let agency;
    if (event.agencyId) {
      agency = await prisma.agency.findUnique({ where: { id: event.agencyId } });
    } else if (event.processorCustomerId) {
      agency = await prisma.agency.findFirst({
        where: { billingProcessorId: event.processorCustomerId },
      });
    }
    if (!agency) return NextResponse.json({ handled: false, reason: "Agency not found" });

    // Process event
    switch (event.type) {
      case "payment_succeeded":
        await prisma.agency.update({
          where: { id: agency.id },
          data: { subscriptionStatus: "active", currentPeriodEnd: event.currentPeriodEnd || null },
        });
        break;
      case "payment_failed":
        await prisma.agency.update({
          where: { id: agency.id },
          data: { subscriptionStatus: "past_due" },
        });
        break;
      case "subscription_canceled":
        await prisma.agency.update({
          where: { id: agency.id },
          data: { subscriptionStatus: "canceled" },
        });
        break;
      case "subscription_updated":
        await prisma.agency.update({
          where: { id: agency.id },
          data: {
            subscriptionId: event.subscriptionId || agency.subscriptionId,
            subscriptionStatus: event.status || agency.subscriptionStatus,
            currentPeriodEnd: event.currentPeriodEnd || agency.currentPeriodEnd,
          },
        });
        break;
    }

    return NextResponse.json({ handled: true });
  } catch (err) {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
