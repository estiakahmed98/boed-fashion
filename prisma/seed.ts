import { seedBoed } from "./boed-seed";
import { seedAdmin } from "./admin-seed";
import { seedDemoSuitStock } from "./demo-suit-seed";

// Prisma's default seed imports the BOED catalog without the removed demo seeds.
async function main() {
  await seedBoed({ apply: true });
  await seedAdmin();
  await seedDemoSuitStock();
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
