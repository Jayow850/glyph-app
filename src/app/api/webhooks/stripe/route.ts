import { NextRequest, NextResponse } from "next/server";
import { stripe, handleStripeEvent } from "@/lib/stripe/billing";
import { creditCoinPurchase } from "@/lib/services/gifts";

export async function POST(req: NextRequest) {
  const sig = req.headers.get("stripe-signature")!;
  const raw = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  // Coin recharge: credit ONLY on confirmed payment; idempotent by payment-intent
  if (event.type === "checkout.session.completed") {
    const s = event.data.object as { metadata?: Record<string, string>; payment_intent?: string };
    if (s.metadata?.kind === "coin_recharge" && s.payment_intent) {
      await creditCoinPurchase(s.metadata.userId, String(s.payment_intent), parseInt(s.metadata.coins, 10));
    }
  }
  await handleStripeEvent(event);
  return NextResponse.json({ received: true });
}
