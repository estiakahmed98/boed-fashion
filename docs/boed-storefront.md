# BOED storefront integration

The supplied `front_End` is the visual reference. The live storefront uses the existing Prisma catalog, product projections, cart and wishlist providers, authentication, checkout, orders and payments. The reference's standalone demo store, account and admin implementations are not connected to production.

The home page reuses the reference editorial layout and local `public/editorial` images. `/ecommerce/products` provides collections, search, sorting, price, brand, type, attribute, specification and variant filters, and pagination. `/ecommerce/collections/[slug]` resolves the reference collection links. Physical products use the reference gallery and an options-aware purchase panel, preserving product information, reviews and questions; other product types retain the existing purchase flow. The shopping bag drawer uses the existing cart. Cart, checkout and account routes retain their established behavior.

## Seed mapping

`public/boed_static_public/products.json` remains the source of truth. `scripts/boed-catalog.mjs` maps it to the current schema without a migration:

| Source | Database |
| --- | --- |
| category path | Category parent/child records; Shirts groups Classic/Casual Shirts and Jackets groups Outerwear |
| slug, name, description | Product with deterministic BOED SKU and PHYSICAL type |
| price, currency | basePrice and variant price/currency |
| image, images | image/gallery, corrected to `/boed_static_public/boed-media/` |
| verified sizes | ProductVariant and ProductVariantOption/Value |
| review flags, source URL, candidate sizes, estimated stock | variant options `__meta`, retained for review |

All 338 supplied rows have unverified stock and sizes. The catalog importer keeps their sellable stock at zero. The default seed also initializes the specifically requested `blue-double-breasted-suit-made-in-italy` with 48 demo units from the source JSON, once only, to demonstrate Add to Cart. Existing inventory and warehouse stock are preserved on repeat runs. Candidate sizes are not actual variants. Prices remain estimates and the physical product page displays a review notice while the variant metadata requires verification. Verify prices, images, descriptions, sizes and real inventory in the existing admin before enabling sale. Existing products and categories are never overwritten by the catalog importer; unrelated slug/SKU/hierarchy collisions stop the import. Each new product and its category/variant records are inserted transactionally.

```powershell
npx prisma db seed             # default seed: imports missing BOED products
npm run seed:admin             # seeds the requested admin account
npm run seed:boed -- --export   # validates every asset; exports mapping under .git
npm run seed:boed -- --apply    # inserts missing records into DATABASE_URL
npm run test:boed
```

The default seed now creates/updates `admin@example.com` with password `admin123` (or `SEED_ADMIN_PASSWORD` when supplied) and a global superadmin role, as explicitly requested. Re-running this account seed resets that account's password. No database reset, deletion, schema migration or settings replacement is performed. Restart the dev server after CLI import to clear cached catalog data. In production use the existing catalog revalidation/admin workflow.

## Verification in this checkout

The catalog mapping and asset checks pass for every row; four focused importer tests pass. Changed application files pass ESLint, and `npm run typecheck` now passes for the full project. `next typegen` succeeds. The footer newsletter form was browser-tested with a mocked API response, so no test subscription was sent. Cart option labels omit internal metadata.

The default `prisma/seed.ts` calls the shared BOED importer, requested admin seed and targeted demo-suit inventory seed. It no longer imports the removed Startech, healthcare or banner modules. `npx prisma db seed` inserted 338 products, and repeat runs skipped the existing catalog. Browser verification confirms the sticky header remains at y=0 after scrolling, the mega-menu images load, the mobile navigation has no horizontal overflow, the requested suit adds to the bag, and the requested admin credentials sign in successfully and open `/admin` with HTTP 200. The reference runs from `Aura_boed` at port 3001; these changes are in this repository, running at port 3000.
