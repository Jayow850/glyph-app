/**
 * Drop the club's own name from a title shown inside that club.
 *
 * Club nights are named "<Club> club night — 30 Oct" so they read
 * correctly in a global list. Inside the club's own pages the prefix
 * is redundant, and at 360px it ate the whole row and truncated the
 * date, which is the only part that distinguishes one club night from
 * the next. Stripped on render, so the stored name stays useful
 * everywhere else.
 */
export function stripClubName(title: string, clubName: string) {
  const trimmed = title.startsWith(clubName) ? title.slice(clubName.length) : title;
  const cleaned = trimmed.replace(/^[\s—–-]+/, "").trim();
  if (!cleaned) return title;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}
