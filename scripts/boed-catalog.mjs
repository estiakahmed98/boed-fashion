import { createHash } from "node:crypto";

export function categorySlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function boedMediaPath(value) {
  if (typeof value !== "string" || !/^\/boed-media\/[a-zA-Z0-9_.-]+$/.test(value)) throw new Error(`Invalid BOED media path: ${value}`);
  return value.replace("/boed-media/", "/boed_static_public/boed-media/");
}

export function normalizeBoedCatalog(source) {
  if (!Array.isArray(source?.products) || source.total !== source.products.length) throw new Error("Invalid BOED catalog or total");
  const slugs = new Set();
  return source.products.map((item, index) => {
    if (!item.name?.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.slug) || slugs.has(item.slug)) throw new Error(`Invalid or duplicate product at row ${index + 1}`);
    slugs.add(item.slug);
    if (!Number.isFinite(item.price) || item.price < 0 || item.price > 99999999.99 || item.currency !== "BDT") throw new Error(`Invalid price/currency: ${item.slug}`);
    if (!Number.isSafeInteger(item.stock) || item.stock < 0) throw new Error(`Invalid stock: ${item.slug}`);
    const categories = item.category.split(" / ").map(name => name.trim());
    if (categories.length !== 2 || categories.some(name => !name)) throw new Error(`Invalid category: ${item.slug}`);
    // Shirts and jackets are navigation parents, retaining the source subcategories.
    if (["Classic Shirts", "Casual Shirts"].includes(categories[1])) categories.splice(1, 0, "Shirts");
    if (categories[1] === "Outerwear") categories.splice(1, 0, "Jackets");
    const gallery = [...new Set([item.image, ...(item.images || [])].filter(Boolean).map(boedMediaPath))];
    const sku = `BOED-${createHash("sha256").update(item.slug).digest("hex").slice(0, 16).toUpperCase()}`;
    const verifiedSizes = item.requiresSizeVerification ? [] : [...new Set((item.sizes || []).filter(value => typeof value === "string" && value.trim()))];
    // Aggregate stock cannot be distributed across sizes without per-size evidence.
    const stock = item.requiresStockVerification || item.requiresPriceVerification || item.requiresSizeVerification || item.needsReview || verifiedSizes.length > 1 ? 0 : item.stock;
    const metadata = {
      sourceId: item.id, sourceUrl: item.sourceUrl, sourceCategory: item.category,
      priceSource: item.priceSource, stockSource: item.stockSource,
      descriptionSource: item.descriptionSource,
      requiresPriceVerification: Boolean(item.requiresPriceVerification),
      requiresStockVerification: Boolean(item.requiresStockVerification),
      requiresSizeVerification: Boolean(item.requiresSizeVerification),
      requiresDescriptionReview: Boolean(item.requiresDescriptionReview),
      needsReview: Boolean(item.needsReview), candidateSizes: item.candidateSizes || [],
      estimatedStock: item.stock,
    };
    return {
      categories: categories.map(name => ({ name, slug: categorySlug(name) })),
      product: {
        name: item.name.trim(), slug: item.slug, sku, type: "PHYSICAL",
        description: item.description || item.name, basePrice: item.price,
        currency: item.currency, image: gallery[0] || null, gallery,
        available: true, featured: categories.includes("Suits"),
      },
      variants: (verifiedSizes.length ? verifiedSizes : [null]).map((size, position) => ({
        sku: `${sku}-${position + 1}`, price: item.price, currency: item.currency,
        stock, active: true, isDefault: position === 0,
        options: { ...(size ? { Size: size } : {}), __meta: metadata },
      })),
      verifiedSizes,
      review: metadata,
    };
  });
}
