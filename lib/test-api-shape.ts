// Run: npm run test:api-shape
//
// A standing guard against one specific, repeatable mistake.
//
// `prisma.user.findMany({ include: { profile: true } })` returns EVERY
// scalar column on User. User carries `email` and `passwordHash`. Any
// route that passes such a result to NextResponse.json publishes both.
//
// This happened three times in this codebase — once on an unauthenticated
// search endpoint that nothing even called. The mistake is invisible in
// review because `include` and `select` look equally innocent, so it gets
// a test rather than a code-review convention.
//
// The rule: inside src/app/api, a user-shaped relation is loaded with
// `select`, never `include`.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

let pass = 0, fail = 0;

function check(name: string, ok: boolean, detail?: string) {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); }
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (entry === "route.ts") out.push(full);
  }
  return out;
}

/** Relations whose target is a User, and so carries email + passwordHash. */
const USER_RELATIONS = [
  "author", "user", "white", "black", "challenger", "defender",
  "owner", "follower", "following", "champion", "host",
];

const routes = walk("src/app/api");
console.log(`\nScanning ${routes.length} route handlers for user relations loaded with \`include\`\n`);

/** Comments describe the mistake; they are not the mistake. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const leaks: string[] = [];      // include + the object returned as-is
const overfetch: string[] = [];  // include, but the response is shaped

for (const file of routes) {
  const src = stripComments(readFileSync(file, "utf8"));

  const relation = USER_RELATIONS.find((rel) =>
    new RegExp(`\\b${rel}\\s*:\\s*\\{\\s*include\\s*:`).test(src),
  );
  const direct =
    /prisma\.user\.find\w+\(\{(?:(?!\}\s*\))[\s\S])*?include\s*:/.test(src) &&
    !/prisma\.user\.find\w+\(\{(?:(?!\}\s*\))[\s\S])*?select\s*:/.test(src);

  if (!relation && !direct) continue;

  // Returning a bare identifier hands the query result straight out.
  // A shaped response (.map, or an inline object) keeps it back.
  const returnsRaw = /return NextResponse\.json\(\s*[a-zA-Z_][\w]*\s*[,)]/.test(src);
  const shapes = /\.map\(/.test(src);

  const what = `${file}  →  ${relation ? `${relation}: { include: … }` : "prisma.user.find…({ include: … })"}`;
  if (returnsRaw && !shapes) leaks.push(what);
  else overfetch.push(what);
}

check(
  "no API route returns a user relation loaded with `include`",
  leaks.length === 0,
  leaks.join("\n       "),
);

if (overfetch.length > 0) {
  console.log(`\n  note: ${overfetch.length} route(s) load a user relation with \`include\` but shape`);
  console.log("        the response before returning it. Not a leak today, one careless");
  console.log("        refactor away from one. Worth tightening to \`select\`:");
  for (const o of overfetch) console.log(`          ${o}`);
  console.log("");
}

// A second, blunter net: no route may name these columns in a response.
const named: string[] = [];
for (const file of routes) {
  const src = readFileSync(file, "utf8");
  for (const col of ["passwordHash", "banReason"]) {
    if (new RegExp(`${col}\\s*:\\s*true`).test(src)) named.push(`${file} → ${col}: true`);
  }
}
check("no API route selects passwordHash or banReason", named.length === 0, named.join("\n       "));

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail > 0) {
  console.log("A user relation loaded with `include` returns email and passwordHash.");
  console.log("Replace it with `select` naming only the fields the client reads.\n");
  process.exit(1);
}
