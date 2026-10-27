import { loadEnvConfig } from "@next/env";
import { readFile, access, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizeBoedCatalog } from "../scripts/boed-catalog.mjs";
import type { Prisma } from "../generated/prisma";
import { syncVariantWarehouseStock } from "../lib/inventory";
import { resolveBoedCategory } from "./boed-categories";

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
  let created = 0; let skipped = 0;   let stockRestored = 0;
  let stockLevelsInitialized = 0;
  const categoryCache = new Map<string, { id: number; parentId: number | null }>();
  try {
    // Check identity collisions before inserts or the one-time legacy stock repair.
    const existing = await db.product.findMany({ where: { OR: [{ slug: { in: catalog.map(item => item.product.slug) } }, { sku: { in: catalog.map(item => item.product.sku) } }] }, select: {
      id: true, slug: true, sku: true,
      variants: { select: { id: true, sku: true, stock: true, active: true, options: true, _count: { select: { stockLevels: true, orderItems: true, inventoryLogs: true } } } },
    } });
    const bySlug = new Map(existing.map(item => [item.slug, item]));
    for (const item of catalog) {
      const collision = bySlug.get(item.product.slug);
      if (collision && collision.sku !== item.product.sku) throw new Error(`Existing unrelated product uses slug: ${item.product.slug}`);
      if (existing.some(row => row.sku === item.product.sku && row.slug !== item.product.slug)) throw new Error(`SKU collision: ${item.product.sku}`);
    }
    let primaryWarehouse = await db.warehouse.findFirst({
      orderBy: [{ isDefault: "desc" }, { id: "asc" }],
      select: { id: true },
    });
    if (!primaryWarehouse) {
      primaryWarehouse = await db.warehouse.create({
        data: { name: "Main Warehouse", code: "MAIN", country: "BD", isDefault: true },
        select: { id: true },
      });
    }

    for (const item of catalog) {
      const imported = bySlug.get(item.product.slug);
      if (imported) {
        for (const variant of imported.variants) {
          const sourceVariant = item.variants.find(source => source.sku === variant.sku);
          if (!sourceVariant) continue;
          const options = (variant.options && typeof variant.options === "object" && !Array.isArray(variant.options) ? variant.options : {}) as Prisma.JsonObject;
          const metadata = (options.__meta && typeof options.__meta === "object" && !Array.isArray(options.__meta) ? options.__meta : {}) as Prisma.JsonObject;
          if (variant.active && variant.stock === sourceVariant.stock && !variant._count.stockLevels && !variant._count.orderItems && !variant._count.inventoryLogs && metadata.sourceId === item.review.sourceId && (sourceVariant.stock === 0 || metadata.sourceStockInitialized) && !metadata.demoStockSeeded) {
            await db.$transaction(tx => syncVariantWarehouseStock({
              tx,
              productId: imported.id,
              productVariantId: variant.id,
              quantity: sourceVariant.stock,
              reason: "Initialize missing warehouse stock from BOED catalog",
              warehouseId: primaryWarehouse.id,
            }), { maxWait: 10_000, timeout: 30_000 });
            stockLevelsInitialized++;
          }
        }
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
      const categoryId = await resolveBoedCategory(db, item.categories, categoryCache);
      // Nested writes atomically create the product, variants and stock without
      // holding an interactive transaction across category network round trips.
      await db.product.create({ data: {
          ...item.product, type: "PHYSICAL", categoryId,
          variants: {
            create: item.variants.map(variant => ({
              ...variant,
              stockLevels: {
                create: {
                  warehouseId: primaryWarehouse.id,
                  quantity: variant.stock,
                  reserved: 0,
                },
              },
            })),
          },
          ...(item.verifiedSizes.length ? { variantOptions: { create: { name: "Size", position: 0, values: { create: item.verifiedSizes.map((value, position) => ({ value, position })) } } } } : {}),
        } });
      created++;
      if (created % 25 === 0) console.log(`BOED import progress: ${created} products created.`);
    }
    console.log(`BOED import complete: ${created} created, ${skipped} already present, ${stockRestored} legacy stock quantities restored from JSON, ${stockLevelsInitialized} missing warehouse stock levels initialized.`);
  } finally { await db.$disconnect(); }
}
