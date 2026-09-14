import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe/billing";

/**
 * RECHARGE — users buy coin packs with real money via Stripe Checkout.
 * Coins are credited ONLY by the webhook after payment succeeds
 * (creditCoinPurchase, idempotent by payment-intent), never optimistically.
 * Prices are server-defined; the client can only pick a pack id.
 */
const COIN_PACKS = {
  starter: { coins: 100,  cents: 99,   label: "100 coins" },
  popular: { coins: 550,  cents: 499,  label: "550 coins · best value" },
  pro:     { coins: 1200, cents: 999,  label: "1,200 coins" },
  whale:   { coins: 6500, cents: 4999, label: "6,500 coins" },
} as const;

const Body = z.object({ pack: z.enum(["starter", "popular", "pro", "whale"]) });

export async function GET() { return NextResponse.json(COIN_PACKS); }

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { pack } = Body.parse(await req.json());
  const p = COIN_PACKS[pack];
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price_data: { currency: "usd", unit_amount: p.cents, product_data: { name: `GLYPH ${p.label}` } }, quantity: 1 }],
    metadata: { kind: "coin_recharge", userId, coins: String(p.coins) }, // webhook reads this
    success_url: `${process.env.NEXTAUTH_URL}/wallet?recharged=1`,
    cancel_url: `${process.env.NEXTAUTH_URL}/wallet?cancelled=1`,
  });
  return NextResponse.json({ checkoutUrl: session.url });
}
