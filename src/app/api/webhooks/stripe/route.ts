import { NextRequest, NextResponse } from "next/server";
import { stripe, handleStripeEvent } from "@/lib/stripe/billing";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!;
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  await handleStripeEvent(event);
  return NextResponse.json({ received: true });
}