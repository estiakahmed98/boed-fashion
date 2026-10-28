import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import bcrypt from "bcryptjs";

const source = readFileSync(new URL("../prisma/admin-seed.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ existing = null, assignment = null, password, failure } = {}) {
  const writes = [];
  let disconnected = false;
  const tx = {
    user: {
      findUnique: async () => existing,
      upsert: async (args) => {
        if (failure) throw failure;
        writes.push({ model: "user", ...args });
        return { id: "admin-id" };
      },
    },
    role: {
      upsert: async (args) => {
        writes.push({ model: "role", ...args });
        return { id: "role-id" };
      },
    },
    userRole: {
      findFirst: async () => assignment,
      create: async (args) => writes.push({ model: "userRole", ...args }),
    },
  };
  const sandbox = {
    exports: {},
    process: { cwd: () => ".", env: { SEED_ADMIN_PASSWORD: password } },
    console: { log() {} },
    require(name) {
      if (name === "@next/env") return { loadEnvConfig() {} };
      if (name === "bcryptjs") return bcrypt;
      if (name === "../generated/prisma") return {
        PrismaClient: class {
          async $transaction(callback) { return callback(tx); }
          async $disconnect() { disconnected = true; }
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  };
  vm.runInNewContext(compiled, sandbox);
  return { seedAdmin: sandbox.exports.seedAdmin, writes, disconnected: () => disconnected };
}

test("deployment bootstrap creates a login-compatible admin and global superadmin assignment", async () => {
  const f = fixture();
  await f.seedAdmin({ ifMissing: true });
  const user = f.writes.find(row => row.model === "user");
  assert.equal(user.create.email, "admin@example.com");
  assert.equal(user.create.role, "admin");
  assert.equal(user.create.banned, false);
  assert.ok(await bcrypt.compare("admin123", user.create.passwordHash));
  assert.equal(f.writes.find(row => row.model === "role").create.name, "superadmin");
  assert.equal(f.writes.find(row => row.model === "userRole").data.scopeType, "GLOBAL");
  assert.equal(f.disconnected(), true);
});

test("redeployment preserves an existing account even when seed password changes", async () => {
  const f = fixture({ existing: { id: "existing" }, password: "new-private-password" });
  await f.seedAdmin({ ifMissing: true });
  assert.equal(f.writes.length, 0);
  assert.equal(f.disconnected(), true);
});

test("explicit seed resets credentials using SEED_ADMIN_PASSWORD without duplicating role assignments", async () => {
  const f = fixture({ existing: { id: "existing" }, assignment: { id: "assignment" }, password: "chosen-password" });
  await f.seedAdmin();
  const user = f.writes.find(row => row.model === "user");
  assert.ok(await bcrypt.compare("chosen-password", user.update.passwordHash));
  assert.equal(f.writes.filter(row => row.model === "userRole").length, 0);
});

test("database errors fail the seed and release the connection", async () => {
  const f = fixture({ failure: new Error("Database unavailable") });
  await assert.rejects(f.seedAdmin(), /Database unavailable/);
  assert.equal(f.disconnected(), true);
});
