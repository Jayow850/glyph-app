/** Build a PGN from a finished game's move list. Server-side twin of
 *  the one the board uses, so an archived tournament game reads the
 *  same as one a player posts to their feed. */
export function sansToPgn(
  sans: string[],
  headers: { White: string; Black: string; Result: string; Event?: string; Round?: string; Date?: string },
): string {
  const date = headers.Date ?? new Date().toISOString().slice(0, 10).replace(/-/g, ".");
  const all: Record<string, string> = {
    Event: headers.Event ?? "GLYPH game",
    Date: date,
    Round: headers.Round ?? "-",
    White: headers.White,
    Black: headers.Black,
    Result: headers.Result,
  };

  const head = Object.entries(all).map(([k, v]) => `[${k} "${v}"]`).join("\n");

  let body = "";
  sans.forEach((san, i) => {
    if (i % 2 === 0) body += `${i / 2 + 1}. `;
    body += `${san} `;
  });

  return `${head}\n\n${body.trim()} ${headers.Result}`.trim();
}
