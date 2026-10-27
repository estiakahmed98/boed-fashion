import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { normalizeBoedCatalog, boedMediaPath } from "../scripts/boed-catalog.mjs";

const source = JSON.parse(readFileSync(new URL("../public/boed_static_public/products.json", import.meta.url), "utf8"));
test("all BOED products map to unique database identities and existing local assets", () => {
  const rows = normalizeBoedCatalog(source);
  assert.equal(rows.length, 338);
  assert.equal(new Set(rows.map(row => row.product.sku)).size, rows.length);
  for (const row of rows) {
    for (const image of row.product.gallery) assert.ok(existsSync(path.join(process.cwd(), "public", image)), image);
    assert.ok(row.categories.length >= 2);
    assert.equal(row.product.currency, "BDT");
    assert.equal(row.variants.filter(variant => variant.isDefault).length, 1);
  }
});
test("estimates and candidate sizes never become sellable stock or verified variants", () => {
  for (const row of normalizeBoedCatalog(source)) {
    assert.ok(row.variants.every(variant => variant.stock === 0));
    assert.deepEqual(row.verifiedSizes, []);
    assert.equal(row.variants[0].options.__meta.requiresPriceVerification, true);
    assert.ok(Array.isArray(row.variants[0].options.__meta.candidateSizes));
  }
});
test("rejects duplicated slugs, invalid money and traversal paths", () => {
  assert.throws(() => normalizeBoedCatalog({ total: 2, products: [source.products[0], source.products[0]] }));
  assert.throws(() => normalizeBoedCatalog({ total: 1, products: [{ ...source.products[0], price: -1 }] }));
  assert.throws(() => boedMediaPath("/boed-media/../../.env"));
});
test("verified size variants preserve options without guessing per-size inventory", () => {
  const item = { ...source.products[0], requiresPriceVerification: false, requiresSizeVerification: false, requiresStockVerification: false, sizes: ["M", "L"], stock: 10 };
  const [row] = normalizeBoedCatalog({ total: 1, products: [item] });
  assert.deepEqual(row.verifiedSizes, ["M", "L"]);
  assert.deepEqual(row.variants.map(variant => variant.options.Size), ["M", "L"]);
  assert.ok(row.variants.every(variant => variant.stock === 0));
  assert.equal(row.product.sku, normalizeBoedCatalog({ total: 1, products: [item] })[0].product.sku);
});
