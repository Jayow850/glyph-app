import { prisma } from "../prisma";

/**
 * Rating claims — the fake-2800 defense.
 * The highest classical rating ever recorded is 2882 (Carlsen, 2014).
 * Rules:
 *  - > 2882           → rejected outright.
 *  - manual > 2400    → rejected; titled-level ratings require a verified import.
 *  - manual ≤ 2400    → accepted as PROVISIONAL + UNVERIFIED; chip shows "1847?"
 *                        until 20 rated Glyph games confirm it.
 *  - OAuth import     → VERIFIED (Lichess/Chess.com token proves account ownership);
 *                        chip shows the ✓.
 * Provisional players carry K=40, so an inflated claim corrects itself fast:
 * a fake 2400 losing to real 1600s bleeds ~30 points per game.
 */
export const HIGHEST_RATING_EVER = 2882;
export const MANUAL_CLAIM_CEILING = 2400;

export async function claimRating(userId: string, claimed: number, source?: "LICHESS" | "CHESSCOM" | "FIDE") {
  if (claimed > HIGHEST_RATING_EVER) {
    throw new Response(`The highest rating in history is ${HIGHEST_RATING_EVER}. We'll believe it when you earn it over the board.`, { status: 422 });
  }
  const verified = !!source; // in production: source implies a completed OAuth/token flow
  if (!verified && claimed > MANUAL_CLAIM_CEILING) {
    throw new Response(`Ratings above ${MANUAL_CLAIM_CEILING} need verification — import from Lichess, Chess.com, or link a FIDE ID.`, { status: 422 });
  }
  for (const tc of ["RAPID", "BLITZ", "BULLET"] as const) {
    await prisma.rating.upsert({
      where: { userId_clubId_timeControl: { userId, clubId: null as never, timeControl: tc } },
      create: { userId, timeControl: tc, current: claimed, peak: claimed, gamesPlayed: verified ? 20 : 0, provisional: !verified, verified, verifySource: source },
      update: { current: claimed, peak: claimed, provisional: !verified, verified, verifySource: source },
    }).catch(async () => {
      const r = await prisma.rating.findFirst({ where: { userId, clubId: null, timeControl: tc } });
      if (r) await prisma.rating.update({ where: { id: r.id }, data: { current: claimed, provisional: !verified, verified, verifySource: source } });
      else await prisma.rating.create({ data: { userId, timeControl: tc, current: claimed, peak: claimed, provisional: !verified, verified, verifySource: source } });
    });
  }
  return { verified, provisional: !verified, rating: claimed };
}
