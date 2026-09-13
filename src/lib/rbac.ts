import { prisma } from "./prisma";
import type { Role } from "@prisma/client";

// Role hierarchy — higher index = more power
const ORDER: Role[] = ["PARENT", "PLAYER", "COACH", "ARBITER", "ORGANIZER", "ADMIN", "OWNER"];

export const can = {
  manageClub:      (r: Role) => atLeast(r, "ADMIN"),
  runTournaments:  (r: Role) => atLeast(r, "ORGANIZER"),
  ruleDisputes:    (r: Role) => atLeast(r, "ARBITER"),
  overridePairing: (r: Role) => atLeast(r, "ARBITER"),
  post:            (r: Role) => atLeast(r, "PLAYER"),
};

function atLeast(role: Role, min: Role) {
  return ORDER.indexOf(role) >= ORDER.indexOf(min);
}

/** Multi-tenant guard: verifies user belongs to club, returns their role. */
export async function memberRole(userId: string, clubId: string): Promise<Role> {
  const m = await prisma.membership.findUnique({
    where: { userId_clubId: { userId, clubId } },
  });
  if (!m || !m.active) throw new Response("Not a club member", { status: 403 });
  return m.role;
}

export async function requireRole(userId: string, clubId: string, check: (r: Role) => boolean) {
  const role = await memberRole(userId, clubId);
  if (!check(role)) throw new Response("Insufficient permissions", { status: 403 });
  return role;
}
