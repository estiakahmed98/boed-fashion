# BOED storefront integration

The supplied `front_End` is the visual reference. The live storefront uses the existing Prisma catalog, product projections, cart and wishlist providers, authentication, checkout, orders and payments. The reference's standalone demo store, account and admin implementations are not connected to production.

The home page reuses the reference editorial layout and local `public/editorial` images. `/ecommerce/products` provides collections, search, sorting, price, brand, type, attribute, specification and variant filters, and pagination. `/ecommerce/collections/[slug]` resolves the reference collection links. Physical products use the reference gallery and an options-aware purchase panel, preserving product information, reviews and questions; other product types retain the existing purchase flow. The shopping bag drawer uses the existing cart. Cart, checkout and account routes retain their established behavior.

## Homepage banners

Homepage campaign images are read from active, currently scheduled Banner Management records on each page request. `HERO` positions 1/2 supply desktop/mobile hero images; `BANNER1` positions 1/2 supply desktop/mobile images for “LONG DAYS. LIGHTER LAYERS.” Mobile falls back to the desktop image when its slot is missing. Missing desktop slots retain the local editorial fallback. If multiple active records occupy a slot, the most recently updated one wins. All four configured image slots were verified in desktop/mobile browsers.

## Seed mapping

### Production deployment

`vercel.json` sets the build command to `npx prisma generate && npx prisma db seed && npm run build`. The default Prisma seed creates or repairs both `admin@example.com` and `admin@gmail.com` with password `admin123`, clears bans, verifies email, and assigns the global superadmin role. Every default seed/deployment resets these two accounts to the requested credentials, including existing accounts. `SEED_ADMIN_PASSWORD` does not override this explicitly requested password. No catalog data or schema is changed.

Vercel must have `DATABASE_URL` configured in the intended deployment environment; a Vercel seed fails if it is missing rather than using a local env fallback. The seed logs only the hostname/database/schema (never the URL credentials), explicitly passes that URL to Prisma, and reads back both accounts after commit to verify their password hashes and global roles. A failure stops the build. Authentication also uses `DATABASE_URL`; Production and Preview values must refer to the intended databases. The schema must already be installed.

Commit/push and redeploy these changes before expecting the current production deployment to change. A dashboard warning about production overrides means the current deployment was built with different settings; saving project settings alone does not rebuild it. The optional `npx prisma db seed -- --if-missing` preserves existing accounts and is no longer used by the Vercel build.

The reported deployment completed schema sync but failed inside the BOED importer with a closed/invalid Prisma transaction before Next.js started building. Category paths are now cached per import and resolved outside interactive transactions. Product, variant, size-option and warehouse-stock nested writes remain atomic. Categories may remain after a failed product insert; rerunning the importer reuses them and skips completed products. The remaining inventory-repair and admin transactions have explicit 10-second acquisition and 30-second execution limits; database/proxy limits can still end a connection earlier.

Run database setup separately against the intended database when needed. For an existing database created with `db push`, follow `prisma/migrations-release/README.md` before adopting migrations. The failed deployment already synchronized its schema, so another schema push is not needed just to retry that build. To resume only the catalog import, run `npm run seed:boed -- --apply` with the intended database environment; `npx prisma db seed` also resets the configured seed admin account. New databases still require schema setup and an explicit seed before serving the catalog.

`public/boed_static_public/products.json` remains the source of truth. `scripts/boed-catalog.mjs` maps it to the current schema without a migration:

| Source | Database |
| --- | --- |
| category path | Category parent/child records; Shirts groups Classic/Casual Shirts and Jackets groups Outerwear |
| slug, name, description | Product with deterministic BOED SKU and PHYSICAL type |
| price, currency | basePrice and variant price/currency |
| image, images | image/gallery, corrected to `/boed_static_public/boed-media/` |
| verified sizes | ProductVariant and ProductVariantOption/Value |
| review flags, source URL, candidate sizes, estimated stock | variant options `__meta`, retained for review |

The catalog importer uses each product's explicit JSON `stock` for its single default variant. Price/size/source review flags remain metadata and no longer silently force stock to zero. Candidate sizes are not actual variants; products with multiple verified sizes still need per-size quantities. Existing unmodified BOED rows left at zero by the old importer receive a one-time stock repair from JSON, marked by `sourceStockInitialized`. Rows with warehouse stock, inventory logs, order history, multiple variants or previously initialized stock are preserved. Normal repeat runs do not replenish sold or manually adjusted inventory. Unrelated slug/SKU/hierarchy collisions stop the import. Category paths are resolved and cached separately; each new product and its nested variant, option and stock records are inserted atomically.

```powershell
npx prisma db seed             # default seed: creates/resets the admin account
npm run seed:admin             # seeds the requested admin account
npm run seed:boed -- --export   # validates every asset; exports mapping under .git
npm run seed:boed -- --apply    # imports missing records and repairs untouched legacy zero-stock rows
npm run test:boed
```

The default seed creates/updates `admin@example.com` and `admin@gmail.com` with password `admin123` and global superadmin roles. Re-running it resets both accounts to these requested credentials. No database reset, deletion, schema migration or settings replacement is performed.

## Verification in this checkout

The catalog mapping and asset checks pass for every row; four focused importer tests pass. Changed application files pass ESLint, and `npm run typecheck` now passes for the full project. `next typegen` succeeds. The footer newsletter form was browser-tested with a mocked API response, so no test subscription was sent. Cart option labels omit internal metadata.

The default `prisma/seed.ts` now calls only the requested admin seed. Catalog imports remain available through `npm run seed:boed -- --apply`. Earlier catalog verification inserted 338 products and repeat imports skipped existing products. Browser verification confirmed the sticky header, mega-menu images, mobile navigation, suit purchase flow, and admin sign-in. The reference runs from `Aura_boed` at port 3001; this repository runs at port 3000.
