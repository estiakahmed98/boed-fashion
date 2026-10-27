import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type Prisma } from "../generated/prisma";

// Legacy one-product demo setup; the catalog importer now reads JSON quantities.
export async function seedDemoSuitStock() {
  loadEnvConfig(process.cwd());
  const slug = "blue-double-breasted-suit-made-in-italy";
  const source = JSON.parse(await readFile(path.join(process.cwd(), "public/boed_static_public/products.json"), "utf8")) as { products: Array<{ slug: string; stock: number }> };
  const item = source.products.find(product => product.slug === slug);
  if (!item || !Number.isSafeInteger(item.stock) || item.stock <= 0) throw new Error("Requested suit has no demo stock in the BOED source.");
  const db = new PrismaClient();
  try {
    const product = await db.product.findUnique({ where: { slug }, select: { sku: true, variants: { where: { active: true, isDefault: true }, select: { id: true, stock: true, options: true, stockLevels: { select: { id: true } } } } } });
    const variant = product?.variants[0];
    if (!product?.sku?.startsWith("BOED-") || !variant) throw new Error("Import the BOED catalog before seeding the demo suit.");
    const options = (variant.options && typeof variant.options === "object" && !Array.isArray(variant.options) ? variant.options : {}) as Prisma.JsonObject;
    const metadata = (options.__meta && typeof options.__meta === "object" && !Array.isArray(options.__meta) ? options.__meta : {}) as Prisma.JsonObject;
    if (metadata.sourceStockInitialized || metadata.demoStockSeeded || variant.stock > 0 || variant.stockLevels.length) {
      console.log("Demo suit stock already configured; existing inventory preserved.");
      return;
    }
    await db.productVariant.update({ where: { id: variant.id }, data: { stock: item.stock, options: { ...options, __meta: { ...metadata, demoStockSeeded: true } } } });
    console.log(`Demo suit stock initialized from products.json: ${item.stock} units.`);
  } finally { await db.$disconnect(); }
}
