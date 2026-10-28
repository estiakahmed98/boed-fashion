# BOED storefront integration

The supplied `front_End` is the visual reference. The live storefront uses the existing Prisma catalog, product projections, cart and wishlist providers, authentication, checkout, orders and payments. The reference's standalone demo store, account and admin implementations are not connected to production.

The home page reuses the reference editorial layout and local `public/editorial` images. `/ecommerce/products` provides collections, search, sorting, price, brand, type, attribute, specification and variant filters, and pagination. `/ecommerce/collections/[slug]` resolves the reference collection links. Physical products use the reference gallery and an options-aware purchase panel, preserving product information, reviews and questions; other product types retain the existing purchase flow. The shopping bag drawer uses the existing cart. Cart, checkout and account routes retain their established behavior.

## Homepage banners

Homepage campaign images are read from active, currently scheduled Banner Management records on each page request. `HERO` positions 1/2 supply desktop/mobile hero images; `BANNER1` positions 1/2 supply desktop/mobile images for “LONG DAYS. LIGHTER LAYERS.” Mobile falls back to the desktop image when its slot is missing. Missing desktop slots retain the local editorial fallback. If multiple active records occupy a slot, the most recently updated one wins. All four configured image slots were verified in desktop/mobile browsers.

## Seed mapping

### Production deployment

`vercel.json` sets the build command to `npx prisma generate && npx prisma db seed -- --if-missing && npm run build`. The admin bootstrap creates `admin@example.com` with a global superadmin role only when the account is missing. Existing credentials and account status are preserved on redeploy. Builds do not change schema or import catalog data. Commit and redeploy these changes for the updated command to take effect. The deployment's `DATABASE_URL` must point to the application's database with its schema already installed.

For a newly created admin, the password is the deployment's `SEED_ADMIN_PASSWORD`, or `admin123` if that variable is absent. Set `SEED_ADMIN_PASSWORD` in the intended Vercel environment before deployment to choose a private password. To create or explicitly reset the seeded admin account, run `npx prisma db seed` (without `--if-missing`) against the intended database; changing the environment variable alone does not reset an existing account during deployment.

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

The default seed now creates/updates `admin@example.com` with password `admin123` (or `SEED_ADMIN_PASSWORD` when supplied) and a global superadmin role, as explicitly requested. Re-running this account seed resets that account's password. No database reset, deletion, schema migration or settings replacement is performed. Restart the dev server after CLI import to clear cached catalog data. In production use the existing catalog revalidation/admin workflow.

## Verification in this checkout

The catalog mapping and asset checks pass for every row; four focused importer tests pass. Changed application files pass ESLint, and `npm run typecheck` now passes for the full project. `next typegen` succeeds. The footer newsletter form was browser-tested with a mocked API response, so no test subscription was sent. Cart option labels omit internal metadata.

The default `prisma/seed.ts` now calls only the requested admin seed. Catalog imports remain available through `npm run seed:boed -- --apply`. Earlier catalog verification inserted 338 products and repeat imports skipped existing products. Browser verification confirmed the sticky header, mega-menu images, mobile navigation, suit purchase flow, and admin sign-in. The reference runs from `Aura_boed` at port 3001; this repository runs at port 3000.
