import { seedAdmin } from "./admin-seed";

// Only seed the admin for now. Catalog and demo-stock seeds remain available
// separately but are intentionally disconnected from Prisma's default seed.
async function main() {
  await seedAdmin({ ifMissing: process.argv.includes("--if-missing") });
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
