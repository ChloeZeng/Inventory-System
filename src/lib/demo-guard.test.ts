import { test } from "node:test";
import assert from "node:assert/strict";
import { demoResetRefusal } from "./demo-guard";

const dir = "/app/prisma";

test("demo reset runs only on a local SQLite file in prisma/", () => {
  assert.equal(demoResetRefusal({ DATABASE_URL: "file:./dev.db" }, dir), null);
  assert.equal(demoResetRefusal({ DATABASE_URL: "file:./demo.db", NODE_ENV: "development" }, dir), null);
  assert.equal(demoResetRefusal({ DATABASE_URL: "file:/app/prisma/dev.db" }, dir), null);
});

test("demo reset refuses anything that could be production", () => {
  assert.match(demoResetRefusal({ DATABASE_URL: "file:./dev.db", NODE_ENV: "production" }, dir)!, /production/);
  assert.match(demoResetRefusal({ DATABASE_URL: "postgresql://db.example.com/svlsg" }, dir)!, /not a local SQLite/);
  assert.match(demoResetRefusal({}, dir)!, /not set/);
  assert.match(demoResetRefusal({ DATABASE_URL: "file:../data/live.db" }, dir)!, /not directly inside/);
  assert.match(demoResetRefusal({ DATABASE_URL: "file:/var/lib/svlsg/dev.db" }, dir)!, /not directly inside/);
  assert.match(demoResetRefusal({ DATABASE_URL: "file:./prod.db" }, dir)!, /production/);
});
