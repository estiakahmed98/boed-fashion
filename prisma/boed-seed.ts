import { loadEnvConfig } from "@next/env";
import { readFile, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeBoedCatalog } from "../scripts/boed-catalog.mjs";
import type { Prisma } from "../generated/prisma";

export async function seedBoed(options: { apply?: boolean; export?: boolean } = {}) {
  loadEnvConfig(process.cwd());
  const source = JSON.parse(await readFile(path.join(process.cwd(), "public/boed_static_public/products.json"), "utf8"));
  const catalog = normalizeBoedCatalog(source);
  const assets = [...new Set(catalog.flatMap(item => item.product.gallery))];
  for (const asset of assets) await access(path.join(process.cwd(), "public", asset));
  const report = {
    products: catalog.length, categories: new Set(catalog.flatMap(item => item.categories.map(category => category.slug))).size,
    assets: assets.length, reviewRequired: catalog.filter(item => item.review.requiresPriceVerification || item.review.requiresStockVerification || item.review.requiresSizeVerification).length,
    sellableStock: catalog.reduce((total, item) => total + item.variants.reduce((sum, variant) => sum + variant.stock, 0), 0),
  };
  console.log(JSON.stringify(report, null, 2));
  if (options.export) {
    await writeFile(path.join(process.cwd(), ".git/boed-normalized-catalog.json"), JSON.stringify(catalog, null, 2));
    console.log("Normalized schema mapping exported to .git/boed-normalized-catalog.json");
  }
  if (!options.apply) { console.log("Validation only. Use --apply to insert missing BOED records."); return; }
  const { PrismaClient } = await import("../generated/prisma/index.js");
  const db = new PrismaClient();
  let created = 0; let skipped = 0; let stockRestored = 0;
  try {
    // Check identity collisions before inserts or the one-time legacy stock repair.
    const existing = await db.product.findMany({ where: { OR: [{ slug: { in: catalog.map(item => item.product.slug) } }, { sku: { in: catalog.map(item => item.product.sku) } }] }, select: {
      slug: true, sku: true,
      variants: { select: { id: true, stock: true, active: true, options: true, _count: { select: { stockLevels: true, orderItems: true, inventoryLogs: true } } } },
    } });
    const bySlug = new Map(existing.map(item => [item.slug, item]));
    for (const item of catalog) {
      const collision = bySlug.get(item.product.slug);
      if (collision && collision.sku !== item.product.sku) throw new Error(`Existing unrelated product uses slug: ${item.product.slug}`);
      if (existing.some(row => row.sku === item.product.sku && row.slug !== item.product.slug)) throw new Error(`SKU collision: ${item.product.sku}`);
    }
    for (const item of catalog) {
      const imported = bySlug.get(item.product.slug);
      if (imported) {
        // Repair the old importer's zero-stock defaults once. Never restock a
        // product that has since been managed, reserved, sold or split into sizes.
        const variant = imported.variants.length === 1 ? imported.variants[0] : null;
        const options = (variant?.options && typeof variant.options === "object" && !Array.isArray(variant.options) ? variant.options : {}) as Prisma.JsonObject;
        const metadata = (options.__meta && typeof options.__meta === "object" && !Array.isArray(options.__meta) ? options.__meta : {}) as Prisma.JsonObject;
        const sourceStock = item.variants.length === 1 ? item.variants[0].stock : 0;
        if (variant?.active && variant.stock === 0 && sourceStock > 0 && metadata.sourceId === item.review.sourceId && !metadata.sourceStockInitialized && !metadata.demoStockSeeded && !variant._count.stockLevels && !variant._count.orderItems && !variant._count.inventoryLogs) {
          const repaired = await db.productVariant.updateMany({
            where: { id: variant.id, stock: 0, active: true, options: { equals: variant.options as Prisma.InputJsonValue }, stockLevels: { none: {} }, orderItems: { none: {} }, inventoryLogs: { none: {} } },
            data: { stock: sourceStock, options: { ...options, __meta: { ...metadata, estimatedStock: item.review.estimatedStock, sourceStockInitialized: true } } },
          });
          stockRestored += repaired.count;
        }
        skipped++;
        continue;
      }
      await db.$transaction(async tx => {
        let parentId: number | null = null;
        for (const category of item.categories) {
          const current: { id: number; parentId: number | null } = await tx.category.upsert({
            where: { slug: category.slug }, update: {},
            create: { ...category, parentId, showInHeader: true, showInFooter: true },
            select: { id: true, parentId: true },
          });
          if (current.parentId !== parentId) throw new Error(`Existing category hierarchy differs: ${category.slug}`);
          parentId = current.id;
        }
        await tx.product.create({ data: {
          ...item.product, type: "PHYSICAL", categoryId: parentId!,
          variants: { create: item.variants },
          ...(item.verifiedSizes.length ? { variantOptions: { create: { name: "Size", position: 0, values: { create: item.verifiedSizes.map((value, position) => ({ value, position })) } } } } : {}),
        } });
      });
      created++;
    }
    console.log(`BOED import complete: ${created} created, ${skipped} already present, ${stockRestored} legacy stock quantities restored from JSON.`);
  } finally { await db.$disconnect(); }
}
