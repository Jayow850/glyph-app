import Stripe from "stripe";
import { prisma } from "../prisma";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "sk_test_placeholder");

export const TIER_LIMITS = {
  FREE:       { members: 50,   tournamentsPerMonth: 2,  seats: 1,  analytics: false, globalRankings: false },
  PRO:        { members: 500,  tournamentsPerMonth: 20, seats: 5,  analytics: true,  globalRankings: true },
  ENTERPRISE: { members: 1e9,  tournamentsPerMonth: 1e9, seats: 1e9, analytics: true, globalRankings: true },
} as const;

export async function createCheckout(clubId: string, tier: "PRO" | "ENTERPRISE", returnUrl: string) {
  const price = tier === "PRO" ? process.env.STRIPE_PRICE_PRO : process.env.STRIPE_PRICE_ENTERPRISE;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    success_url: `${returnUrl}?upgraded=1`,
    cancel_url: returnUrl,
    metadata: { clubId, tier },
  });
  return session.url;
}

/** Stripe webhook handler core — called from route with verified event. */
export async function handleStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      await prisma.subscription.upsert({
        where: { clubId: s.metadata!.clubId },
        create: {
          clubId: s.metadata!.clubId,
          tier: s.metadata!.tier as "PRO" | "ENTERPRISE",
          status: "ACTIVE",
          stripeCustomerId: String(s.customer),
          stripeSubscriptionId: String(s.subscription),
        },
        update: {
          tier: s.metadata!.tier as "PRO" | "ENTERPRISE",
          status: "ACTIVE",
          stripeCustomerId: String(s.customer),
          stripeSubscriptionId: String(s.subscription),
        },
      });
      break;
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      const sub = await prisma.subscription.findFirst({ where: { stripeCustomerId: String(inv.customer) } });
      if (sub) {
        await prisma.payment.create({
          data: {
            subscriptionId: sub.id,
            stripeInvoiceId: inv.id,
            amountCents: inv.amount_paid,
            currency: inv.currency,
            paidAt: new Date(),
            invoiceUrl: inv.hosted_invoice_url ?? undefined,
          },
        });
      }
      break;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      await prisma.subscription.updateMany({
        where: { stripeCustomerId: String(inv.customer) },
        data: { status: "PAST_DUE" },
      });
      break;
    }
    case "customer.subscription.deleted": {
      const s = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: s.id },
        data: { status: "CANCELLED", tier: "FREE" },
      });
      break;
    }
  }
}

/** Enforce tier limits (used before creating tournaments, adding members). */
export async function assertWithinLimits(clubId: string, check: "tournament" | "member") {
  const sub = await prisma.subscription.findUnique({ where: { clubId } });
  const tier = TIER_LIMITS[sub?.tier ?? "FREE"];
  if (check === "member") {
    const count = await prisma.membership.count({ where: { clubId, active: true } });
    if (count >= tier.members) throw new Response("Member limit reached — upgrade your club plan", { status: 402 });
  }
  if (check === "tournament") {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const count = await prisma.tournament.count({ where: { clubId, createdAt: { gte: monthStart } } });
    if (count >= tier.tournamentsPerMonth) throw new Response("Monthly tournament limit reached — upgrade to Pro", { status: 402 });
  }
}
