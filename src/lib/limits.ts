/**
 * Tier limits for clubs and tournaments.
 * Permissive for now — billing isn't shipped, so nothing is capped.
 * When subscriptions launch, enforce real limits here.
 */
export async function assertWithinLimits(_clubId: string, _kind?: string) {
  return true;
}