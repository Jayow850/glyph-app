import type { Role } from "@prisma/client";

/**
 * Club officers, not admins.
 *
 * A real club has a President, a Vice-President who directs the
 * championship, a Treasurer, a Secretary, and a Competition Secretary
 * who maintains the tables. "Admin" is a software word; it tells a
 * member nothing about who to ask when the league table is wrong.
 *
 * Powers live here rather than in the schema, because what an officer
 * may do is a club's business rule and changes; what they are called
 * is their identity and does not.
 */

/** In the order a club lists its officers, not alphabetically. */
export const OFFICER_ORDER: Role[] = [
  "OWNER",
  "PRESIDENT",
  "VICE_PRESIDENT",
  "SECRETARY",
  "COMPETITION_SECRETARY",
  "TREASURER",
  "ARBITER",
  "COACH",
  "ADMIN",
  "ORGANIZER",
];

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  PRESIDENT: "President",
  VICE_PRESIDENT: "Vice-President",
  SECRETARY: "Secretary",
  COMPETITION_SECRETARY: "Competition Secretary",
  TREASURER: "Treasurer",
  ADMIN: "Admin",
  ORGANIZER: "Organizer",
  ARBITER: "Arbiter",
  COACH: "Coach",
  PLAYER: "Member",
  PARENT: "Parent",
};

/** The short form that fits on a row without pushing the name out. */
export const ROLE_BADGE: Partial<Record<Role, string>> = {
  OWNER: "Owner",
  PRESIDENT: "Pres",
  VICE_PRESIDENT: "VP",
  SECRETARY: "Sec",
  COMPETITION_SECRETARY: "Comp Sec",
  TREASURER: "Treas",
  ARBITER: "Arbiter",
  COACH: "Coach",
};

/** Whoever holds an office, as opposed to simply being a member. */
export function isOfficer(role: Role | null | undefined): boolean {
  return Boolean(role && OFFICER_ORDER.includes(role));
}

/** Run the season, create divisions, set the club night, start a night. */
export function canRunCompetitions(role: Role | null | undefined): boolean {
  return Boolean(
    role &&
      (["OWNER", "PRESIDENT", "VICE_PRESIDENT", "COMPETITION_SECRETARY", "ADMIN", "ORGANIZER"] as Role[])
        .includes(role),
  );
}

/** Allocate members to divisions, as a club secretary actually does. */
export function canAllocateDivisions(role: Role | null | undefined): boolean {
  return Boolean(
    role &&
      (["OWNER", "PRESIDENT", "COMPETITION_SECRETARY", "SECRETARY", "ADMIN"] as Role[]).includes(role),
  );
}

/** Settle a disputed result. */
export function canResolveDisputes(role: Role | null | undefined): boolean {
  return Boolean(
    role && (["OWNER", "PRESIDENT", "ARBITER", "ADMIN"] as Role[]).includes(role),
  );
}

/** Pin a post to the club page. */
export function canPin(role: Role | null | undefined): boolean {
  return Boolean(
    role &&
      (["OWNER", "PRESIDENT", "VICE_PRESIDENT", "SECRETARY", "ADMIN", "ORGANIZER"] as Role[])
        .includes(role),
  );
}

/** Award a trophy, close a season, hand an office on. */
export function canAwardHonours(role: Role | null | undefined): boolean {
  return Boolean(role && (["OWNER", "PRESIDENT", "ADMIN"] as Role[]).includes(role));
}

/**
 * Only one person may hold each of these at a time, the way a club has
 * one President. Arbiter and Coach are deliberately not in this list:
 * a club may have several.
 */
export const SINGULAR_OFFICES: Role[] = [
  "PRESIDENT",
  "VICE_PRESIDENT",
  "SECRETARY",
  "COMPETITION_SECRETARY",
  "TREASURER",
];
