import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

/** Wallet home: spendable coins, creator earnings, recent ledger. */
export async function GET() {
  const userId = await requireUser();
  const [wallet, txns] = await Promise.all([
    prisma.wallet.findUnique({ where: { userId } }),
    prisma.coinTxn.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 30 }),
  ]);
  return NextResponse.json({ coins: wallet?.coins ?? 0, earned: wallet?.earned ?? 0, txns });
}
