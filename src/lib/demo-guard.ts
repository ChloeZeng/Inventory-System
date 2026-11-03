// Safety check for the demo reset (scripts/seed-demo.ts), which DELETES every row.
// It may only ever run against a local SQLite demo file inside prisma/ — never production.
// Pure, so it is unit-tested (demo-guard.test.ts).

import path from "node:path";

export function demoResetRefusal(env: { NODE_ENV?: string; DATABASE_URL?: string }, prismaDir: string): string | null {
  if (env.NODE_ENV === "production") return "NODE_ENV is production.";
  const url = env.DATABASE_URL ?? "";
  if (!url) return "DATABASE_URL is not set.";
  // Production runs on a server database (postgres://…); the demo only on a local SQLite file.
  if (!url.startsWith("file:")) return "DATABASE_URL is not a local SQLite file (file:…).";
  const file = url.slice("file:".length).split("?")[0];
  // Prisma resolves a relative SQLite path against the schema's folder (prisma/).
  const absolute = path.resolve(prismaDir, file);
  const dir = path.resolve(prismaDir);
  if (path.dirname(absolute) !== dir) return `the database file ${absolute} is not directly inside ${dir}.`;
  if (/prod/i.test(path.basename(absolute))) return `the database file name ${path.basename(absolute)} looks like production.`;
  return null;
}
