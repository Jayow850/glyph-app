import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { requireRole, can } from "@/lib/rbac";
import { createCheckout } from "@/lib/stripe/billing";

const Body = z.object({ clubId: z.string(), tier: z.enum(["PRO", "ENTERPRISE"]), returnUrl: z.string().url() });

export async function POST(req: NextRequest) {
  const userId = await requireUser();
  const body = Body.parse(await req.json());
  await requireRole(userId, body.clubId, can.manageClub);
  const url = await createCheckout(body.clubId, body.tier, body.returnUrl);
  return NextResponse.json({ url });
}
