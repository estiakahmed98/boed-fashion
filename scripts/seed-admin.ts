import { seedAdmin } from "../prisma/admin-seed";

seedAdmin().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
