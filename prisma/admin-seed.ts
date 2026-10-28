import { loadEnvConfig } from "@next/env";
import { hash } from "bcryptjs";
import { PrismaClient } from "../generated/prisma";

export async function seedAdmin({ ifMissing = false } = {}) {
  loadEnvConfig(process.cwd());
  const db = new PrismaClient();
  const passwordHash = await hash(
    process.env.SEED_ADMIN_PASSWORD || "admin123",
    12,
  );
  try {
    await db.$transaction(
      async (tx) => {
        // Deploys bootstrap missing accounts without resetting existing credentials.
        if (ifMissing && await tx.user.findUnique({ where: { email: "admin@example.com" } })) {
          console.log("Admin account already exists; credentials left unchanged.");
          return;
        }
        const data = {
          name: "Administrator",
          role: "admin",
          passwordHash,
          emailVerified: new Date(),
          banned: false,
          banReason: null,
          banExpires: null,
        };
        const admin = await tx.user.upsert({
          where: { email: "admin@example.com" },
          create: { email: "admin@example.com", ...data },
          update: data,
        });
        const role = await tx.role.upsert({
          where: { name: "superadmin" },
          create: {
            name: "superadmin",
            label: "Super Admin",
            isSystem: true,
            isImmutable: true,
          },
          update: { deletedAt: null, isSystem: true, isImmutable: true },
        });
        const assignment = await tx.userRole.findFirst({
          where: {
            userId: admin.id,
            roleId: role.id,
            scopeType: "GLOBAL",
            warehouseId: null,
          },
        });
        if (!assignment)
          await tx.userRole.create({
            data: { userId: admin.id, roleId: role.id, scopeType: "GLOBAL" },
          });
        console.log("Admin account seeded: admin@example.com (global superadmin).");
      },
      { maxWait: 10_000, timeout: 30_000 },
    );
  } finally {
    await db.$disconnect();
  }
}
