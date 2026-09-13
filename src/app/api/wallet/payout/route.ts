import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Creator payout: drains `earned`, records a Payout row for finance to settle (Stripe Connect transfer in prod). */
const CENTS_PER_COIN = 0.7; // 70% share already applied at gift time; 1 coin ≈ $0.007 payout basis
const Body = z.object({ coins: z.number().int().positive(), idemKey: z.string().min(8).optional() });

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const { coins, idemKey } = Body.parse(await req.json());
  const key = idemKey ?? crypto.randomUUID();
  try {
    const payout = await prisma.$transaction(async (tx) => {
      const w = await tx.wallet.findUnique({ where: { userId } });
      if (!w || w.earned < coins) throw new Error("insufficient");
      await tx.wallet.update({ where: { userId }, data: { earned: { decrement: coins } } });
      await tx.coinTxn.create({ data: { userId, delta: -coins, kind: "PAYOUT", idemKey: key } });
      return tx.payout.create({ data: { userId, coins, amountCents: Math.floor(coins * CENTS_PER_COIN), idemKey: key } });
    });
    return NextResponse.json(payout);
  } catch (e) {
    const code = (e as { code?: string })?.code === "P2002" ? "duplicate" : "insufficient";
    return NextResponse.json({ error: code }, { status: 409 });
  }
}
